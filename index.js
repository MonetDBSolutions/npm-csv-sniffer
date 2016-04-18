/** 
 * CSV sniffer, inspired by the Python CSV library (https://docs.python.org/2/library/csv.html#csv.Sniffer)
 *
 * We implement approximately the same functionality, but we do not pack it in two seperate
 * functions (sniff and has_header) but we do everything inside the sniff function. To
 * prevent doing superfluous work, the user can instruct the sniff function what to do by providing
 * the right arguments to the function. The main reason to do this was because the has_header function
 * in Pythons CSV library makes a call to the sniff function, hence if a user wants to find out everything,
 * sniff will be called twice. Furthermore, we did not implement functionality that we did not need, 
 * and we implemented some things that we did need but were not yet in the Python CSV sniffer.
 * Major differences:
 *    Our sniffer does not calculate doublequote and skipinitialwhitespace
 *    Our sniffer also retrieves the newline character as one of [\r\n, \n\r, \n, \r] in a clever way
 *    Our sniffer improves the performance of the delimiter guesser by not traversing every line of the
 *    input for every ASCII character, but rather traversing every line once and incrementing a corresponding
 *    counter for every encountered character.
 *	  We implement a smarter voting mechanism in the hasHeader check. We also accept give header +1 when
 *    the length of the header column is within some tolerance depending on standard deviation of all 
 *    lengths inside this column.
 *	  Our sniffer passes back labels and records
 */

function getNewlineStr(sample) {
	// Figures out what the most probable row delimiter is. 
	// It does this by registering the line lengths that would arise if a row delimiter
	// would be used. If there is exactly one candidate, this candidate wins.
	// Otherwise, if there is exactly one candidate that causes > n lines, this one wins. This
	// is built in to prevent candidates with just a couple of lines challenging ones with many
	// lines, since if we have a candidate with 2 and a candidate with 90 lines, it seems safe
	// to assume the one with 90 lines always wins. Furthermore, doing statistics on very few lines
	// is not safe anyway. 
	// As a last resort, we have to give a solution for when we have more than one candidate
	// with > n lines. We then calculate for every candidate the average and the standard
	// deviation of the line lengths found. The winning candidate is the one with the 
	// smallest normalized standard deviation.
	var candidates = ["\r\n", "\n\r", "\n", "\r"];
	var nrLines = {};

	var lineLengths = {};
	var threshold = 5; // at least this many lines

	candidates.forEach(function(newlineStr) {
		nrLines[newlineStr] = 1;
		var l = [];
		var curPos = 0;
		while((newlinePos = sample.indexOf(newlineStr, curPos)) > -1) {
			// update nr of lines
			++nrLines[newlineStr];

			var lineLength = newlinePos - curPos;
			l.push(lineLength);
			curPos = newlinePos + newlineStr.length;
		}
		lineLengths[newlineStr] = l;
	});

	// eliminate substrings of \r\n and \n\r whenever they have an equal amount of lines
	["\r\n", "\n\r"].forEach(function(newlineStr) {
		var nr = nrLines[newlineStr];
		if(nr > 1) {
			["\n", "\r"].forEach(function(newlineStr) {
				if(nrLines[newlineStr] == nr) {
					nrLines[newlineStr] = 1;
				}
			});
		}
	});

	// make list of remaining candidates, which are the only ones with > 1 line
	var remainingCandidates = [];
	candidates.forEach(function(newlineStr) {
		if(nrLines[newlineStr] > 1) {
			remainingCandidates.push(newlineStr);
		}
	});

	if(remainingCandidates.length == 0) {
		return null;
	}
	if(remainingCandidates.length == 1) {
		return remainingCandidates[0];
	}

	// > 1 remainers, make list of valid onces, which must have a nr lines > threshold
	var finalRemainers = [];
	var maxNrLines = 0;
	remainingCandidates.forEach(function(newlineStr) {
		var curNrLines = nrLines[newlineStr];
		maxNrLines = Math.max(maxNrLines, curNrLines);
		if(curNrLines > threshold) {
			finalRemainers.push(newlineStr);
		}
	});

	if(finalRemainers.length == 0) {
		var winner = null;
		// no newlinestrs with more than 'threshold' lines... return the one with the max nr of lines
		remainingCandidates.some(function(newlineStr) {
			if(nrLines[newlineStr] == maxNrLines) {
				winner = newlineStr;
				return true;
			}
			return false;
		});
		return winner;
	}
	if(finalRemainers.length == 1) {
		return finalRemainers[0];
	}

	// Time for the final round with the > 1 remainers...
	var winner = null;
	var winnerScore = Infinity;
	finalRemainers.forEach(function(newlineStr) {
		var l = lineLengths[newlineStr];
		var sum = 0;
		l.forEach(function(d) { sum += d; });
		var avg = sum / l.length;

		var absSum = 0;
		l.forEach(function(d) { absSum += Math.abs(d - avg); });
		var score = absSum / l.length / avg; // this calculates absolute differences, normalized to # lines and length of lines

		if(score < winnerScore) {
			winnerScore = score;
			winner = newlineStr;
		}
	});
	return winner;
}



function guessQuoteAndDelimiter(sample, newlineStr, delimiters) {
	// Looks for text enclosed between two identical quotes
    // (the probable quotechar) which are preceded and followed
    // by the same character (the probable delimiter).
    // For example:
    //   ,'some text',
    // The quote with the most wins, same with the delimiter.
    // If there is no quotechar the delimiter can't be determined
    // this way.
    var exprs = [];

    // TODO: Consider un-consuming the delimiter after a match has been found

    var nl = newlineStr.replace("\n", "\\n").replace("\r", "\\r");

    // Add regexp for quotes + delimiter on both sides
    var delimiter = "([^"+nl+"\"'])";
    var content = "[^"+nl+"]*?";
    exprs.push({
    	expr: new RegExp(
		    	delimiter			+ // Delimiter
		    	"\\s*?"				+ // Possible whitespace between delimiter and quote char
		    	"([\"'])"			+ // Quote character
		    	content				+ // Non-greedy parsing of string between quotes
		    	"\\2"				+ // Matching quote character
		    	"\\s*?"				+ // Possible whitespace between quote char and delimiter
		    	"\\1"				  // Matching delimiter
	    	, "g"),
    	delimRef: 1,
    	quoteRef: 2
	});

	// Add regexp for quotes + delimiter on the right side
	exprs.push({
		expr: new RegExp(
		    	"^"					+ // Start of line (note that javascript treats the start of every line as ^)
		    	"\\s*?"				+ // Possible whitespace at start of line
		    	"([\"'])"			+ // Quote character
		    	content				+ // Non-greedy parsing of string between quotes
		    	"\\1"				+ // Matching quote character
		    	"\\s*?"				+ // Possible whitespace between quote char and delimiter
		    	delimiter			  // Delimiter
	    	, "g"),
		delimRef: 2,
		quoteRef: 1
	});

	// Add regexp for quotes + delimiter on the left side
	exprs.push({
		expr: new RegExp(
		    	delimiter			+ // Delimiter
		    	"\\s*?"				+ // Possible whitespace between delimiter and quote char
		    	"([\"'])"			+ // Quote character
		    	content				+ // Non-greedy parsing of string between quotes
		    	"\\2"				+ // Matching quote character
		    	"\\s*?"				+ // Possible whitespace between quote char and end of line
		    	"$"					  // End of line (note that javascript treats the end of every line as $)
	    	, "g"),
		delimRef: 1,
		quoteRef: 2
	});

	// Add regexp for just quotes
	exprs.push({
		expr: new RegExp(
		    	"^"					+ // Start of line (note that javascript treats the start of every line as ^)
		    	"\\s*?"				+ // Possible whitespace at start of line
		    	"([\"'])"			+ // Quote character
		    	content				+ // Non-greedy parsing of string between quotes
		    	"\\1"				+ // Matching quote character
		    	"\\s*?"				+ // Possible whitespace between quote char and end of line
		    	"$"					  // End of line (note that javascript treats the end of every line as $)
	    	, "g"),
		quoteRef: 1
	});

	var matches = [];

	exprs.every(function(d) { // use every here, so we can stop the loop by returning false
		var matchesNew;
		while(matchesNew = d.expr.exec(sample)) {
			var match = {};
			if(d.delimRef && matchesNew[d.delimRef]) match.delim = matchesNew[d.delimRef];
			if(d.quoteRef && matchesNew[d.quoteRef]) match.quote = matchesNew[d.quoteRef];
			matches.push(match);
		}

		return matches.length == 0; // only go to next regexp if matches is still empty
	});
	if(matches.length == 0) {
		return { delim: null, quote: null };
	}

	var delimCounters = {};
	var quoteCounters = {};

	matches.forEach(function(d) {
		if(d.hasOwnProperty("delim") && (!delimiters || delimiters.indexOf(d.delim) > -1)) {
			if(!delimCounters.hasOwnProperty(d.delim)) 	delimCounters[d.delim] = 1;
			else	 									++delimCounters[d.delim];
		}
		if(d.hasOwnProperty("quote")) {
			if(!quoteCounters.hasOwnProperty(d.quote)) 	quoteCounters[d.quote] = 1;
			else										++quoteCounters[d.quote];
		}
	});

	var delims = Object.keys(delimCounters);
	var quotes = Object.keys(quoteCounters);

	var delim = null;
	if(delims.length > 0) {
		var maxCount = -1;
		delims.forEach(function(d) { 
			if(delimCounters[d] > maxCount) {
				delim = d;
				maxCount = delimCounters[d];
			}
		});
	}

	var maxCount = -1;
	quotes.forEach(function(d) {
		if(quoteCounters[d] > maxCount) {
			quote = d;
			maxCount = quoteCounters[d];
		}
	});

	if(delim == "\n") {
		// This is probably a one column file...
		delim = null;
	}

	return {
		delim: delim,
		quote: quote
	}
}

function guessDelimiter(sample, newlineStr, delimiters) {
	// The delimiter /should/ occur the same number of times on
    // each row. However, due to malformed data, it may not. We don't want
    // an all or nothing approach, so we allow for small variations in this
    // number.
    //   1) build a table of the frequency of each character on every line.
    //   2) build a table of frequencies of this frequency (meta-frequency?),
    //      e.g.  'x occurred 5 times in 10 rows, 6 times in 1000 rows,
    //      7 times in 2 rows'
    //   3) use the mode of the meta-frequency to determine the /expected/
    //      frequency for that character
    //   4) find out how often the character actually meets that goal
    //   5) the character that best meets its goal is the delimiter

	// define a range in which to search for ASCII characters
	var startAsciiAt = 0;
	var asciiMax = 127;

	var asciiTables = [];

	var curCharIndex = 0;
	var nrLines = 0;
	var newlinePos;
	while((newlinePos = sample.indexOf(newlineStr, curCharIndex)) > -1) {
		// for every line, we build an ascii table that keeps the number of occurrences
		var ascii = [];
		for(var i=0; i<asciiMax-startAsciiAt; ++i) {
			ascii.push(0); // all chars start with 0
		}
		while(curCharIndex < newlinePos) {
			++ascii[sample.charCodeAt(curCharIndex)-startAsciiAt];
			++curCharIndex;
		}
		// skip over the newline string
		curCharIndex += newlineStr.length;

		// and add this ascii table to the ascii tables array
		asciiTables.push(ascii);
		++nrLines;
	}
	if(nrLines == 0) {
		return null;
	}

	// now transform the ascii tables into a 'frequency of frequency' (meta-frequency) table
	var freqTables = [];
	for(var i=0; i<asciiMax-startAsciiAt; ++i) {
		// for every character, we build a frequencytable
		var freqTable = [];
		asciiTables.forEach(function(d) {
			if(!freqTable[d[i]]) freqTable[d[i]] =  1;
			else 				 freqTable[d[i]] += 1;
		});
		freqTables[i] = freqTable;
	}

	// using this meta-frequency table, we calculate the so called character 'modes', defined 
	// for every character as the max frequency of occurences minus the sum of all other
	// frequencies of occurences
	var modes = [];
	for(var i=0; i<asciiMax-startAsciiAt; ++i) {
		var keys = Object.keys(freqTables[i]);
		if(keys.length == 1 && keys[0] == 0) {
			//This character never occurs on any line
			continue;
		}
		
		// if we arrived here, we are sure that the character occurs at least once somewhere

		//calculate max meta frequency, and also remember the corresponding frequency
		var max = { freq: null, metaFreq: -Infinity };
		freqTables[i].forEach(function(metaFreq, freq) {
			if(metaFreq > max.metaFreq) {
				max.freq = freq;
				max.metaFreq = metaFreq;
			}
		});

		// calculate sum of frequencies
		var sum = 0;
		freqTables[i].forEach(function(d) {
			sum += d;
		});

		// we can now calculate the mode for this character
		modes[i] = { maxFreq: max.freq, mode: max.metaFreq - (sum - max.metaFreq) }; // Equals 2max - sum
	}

	// We now have a mode for each character, which tells us something about the number of
	// meta frequencies. The higher the mode is for a character, the more likely it is that
	// this character is a delimiter. In the perfect case, a character occurs exactly the same
	// times on every line, yielding a mode that equals the number of lines.
	// To find the best candidates for delimiters (the ones closest to the number of lines), we
	// start with a consistency value of 1 and we decrease this by 0.01 every time we do not
	// find at least one delimiter.
	var delims = [];
	var consistency = 1.0;
	var threshold = 0.8; // when this value is reached without finding a candidate for a delimiter, we give up...
	var decreaseStep = 0.01;
	while(delims.length == 0 && consistency > threshold) {
		modes.forEach(function(d, i) {
			if(d.maxFreq == 0 || d.mode <= 0) return;
			var delim = String.fromCharCode(i+startAsciiAt);
			if((d.mode / nrLines) >= consistency && (!delimiters || delimiters.indexOf(delim) > -1)) {
				delims.push(delim);
			}
		});
		consistency -= decreaseStep;
	}

	if(delims.length == 0) {
		return null;
	}

	if(delims.length == 1) {
		return delims[0];
	}

	// We have > 1 delimiter; use a list of known delimiters
	[",", "\t", ";", " ", ":", "|"].forEach(function(d) {
		if(delims.indexOf(d) > -1) {
			return d;
		}
	});

	// We still found no apparent winner... just return the first one
	return delims[0];
}

function parseSample(sample, newlineStr, delimiter, quotechar) {
	// Parse sample by creating a state machine to split lines (necessary because
	// we don't want to split a line if we find a newline str inside a quoted field)
	// Assumption of this function is that the quotechar is not contained inside the
	// newlineStr. This would probably devastate the parsing, but is a safe assumption
	// since it must be a really f*cked up format if the newline string contains the
	// quotechar.
	var lines = [];
	if(!quotechar) {
		// no quote char, simple!
		lines = sample.split(newlineStr);
		if(lines.length > 1) {
			lines.pop(); //drop last element, since that can be an incomplete line
		}
		return lines.map(function(line) { return line.split(delimiter); });
	}

	// if we arrived here, it means the real deal: a quote char needs to be considered
	var result = [];
	var vals = [];
    var curVal = "";
    var insideQuotes = false;
    var escape = false;
    for(var i=0; i<sample.length; ++i) {
    	var curchar = sample.charAt(i);
    	if(!escape) {
    		// only do all of the checks if curchar is not escaped
	    	if(curchar == "\\") {
	    		escape = true;
	    		continue;
	    	}
	    	if(curchar == quotechar) {
	    		insideQuotes = !insideQuotes;
	    		continue;
	    	}

	    	if(!insideQuotes) {
	    		// check if we are currently standing at a newline
				var atNewline = true;
				for(var j=0; j<newlineStr.length; ++j) {
					if(sample.charAt(i+j) != newlineStr.charAt(j)) {
						atNewline = false;
						break;
					}
				}
				if(atNewline || curchar == delimiter) {
					vals.push(curVal);
					curVal = "";
					if(atNewline) {
						if(vals[vals.length-1] == "") { // remove last item if it is completely empty
							vals.pop();
						}
						result.push(vals);
						vals = [];
					}
					continue;
				}
	    	}
    	}
    	escape = false;
    	curVal += curchar;
    }
    // after the loop, remaints might be in the vals array. We leave them there, since it is not considered
    // a complete line if no newline was read after it
    return result;
}

function getAccumulatedType(curValue, curType) {
    // Note: If curType is "integer", this function will return the actual type of
    // curValue
    if(curType == "string") return "string"; //can't get worse than string

    // see if we should fall back to string by seeing if this is a finite number
    if(!isFinite(curValue)) return "string";

    // see if we should fall back from int to float
    if(curType == "float" || curValue%1 !== 0) return "float";

    return "integer";
}

function getTypes(parsedSample) {
	// Parses all lines in the lines array and determines the type of all the columns.
	// Returns three type arrays:
	// - Types considering all rows
	// - Types considering all but the first row
	// - Types considering only the first row

    var firstValues = null; // used to calculate the all array in the end
    var first = [];
    var tail = [];
    var all = null; // will be calculated in the end

    parsedSample && parsedSample.forEach(function(cols, i) {
    	if(i == 0) {
    		firstValues = cols;
    		cols.forEach(function(col) {
    			first.push(getAccumulatedType(col, "integer"));
    			tail.push("integer");
    		});
    		return;
    	}
    	if(cols.length != first.length) {
    		// do not use lines that have not the same number of columns as the header,
    		// since it might steer us into wrong conclusions. We just pray that the
    		// first row of the file (header row) does not contain some weird number of 
    		// columns that differs from all other rows.
    		return;
    	}
		cols.forEach(function(col, colIndex) {
			tail[colIndex] = getAccumulatedType(col, tail[colIndex]);
    	});
    });

    all = tail.slice(0); //copy and accumulate using the first values
    firstValues && firstValues.forEach(function(col, i) {
    	all[i] = getAccumulatedType(col, all[i]);
    });

    return {
    	first: first,
    	tail: tail,
    	all: all
    };
}

function hasHeader(parsedSample) {
	// Figures out the types of data in each column. If any
    // column is of a single type (say, integers), *except* for the first
    // row, then the first row is presumed to be labels. If the type
    // can't be determined, it is assumed to be a string in which case
    // the length of the string is the determining factor: if all of the
    // rows except for the first are the same length, it's a header.
    // Finally, a 'vote' is taken at the end for each column, adding or
    // subtracting from the likelihood of the first row being a header.
 
 	var firstValues = null;
    var lengthsTail = [];

    parsedSample && parsedSample.forEach(function(cols, i) {
    	if(i == 0) {
    		// This is the possible header
    		firstValues = cols;
    		cols.forEach(function() {
    			lengthsTail.push([]);
    		});
    		return;
    	}
    	if(cols.length != firstValues.length) {
    		// do not use lines that have not the same number of columns as the header,
    		// since it might steer us into wrong conclusions. We just pray that the
    		// first row of the file (header row) does not contain some weird number of 
    		// columns that differs from all other rows.
    		return;
    	}

		// Update lengths arrays for this row
    	cols.forEach(function(col, colIndex) {
			lengthsTail[colIndex].push(col.length);
    	});
    });

    var types = getTypes(parsedSample);
	// All types and lengths are known, let every col bring out a vote.
	// Whenever the type of the header col differs from the type of the rest of
	// the column (and type of first row is string), this vote is +2. Otherwise, we use the values in the
	// lengths array to calculate the average and the standard deviation of these
	// lengths. The vote then depends on how close/far it is from the 
	// average. Close to average means negative vote, far from average means positive
	// vote.
	var vote = 0;
	firstValues && firstValues.forEach(function(col, i) {
		if(types.first[i] != types.tail[i] && types.first[i] == "string") {
			// Yup, first row has different type
			return vote += 2;
		}
		var sum = 0;
		lengthsTail[i].forEach(function(d) { sum += d; });
		var avg = sum / lengthsTail[i].length;
		var diffSqSum = 0;
		lengthsTail[i].forEach(function(d) { diffSqSum += ((avg - d)*(avg - d)); });
		var sd = diffSqSum / lengthsTail[i].length;

		// If the header has a length that deviates a lot from the columns, we vote +1.
		// Otherwise, we vote -1
		var tolerance = 2 * sd;

		if(Math.abs(col.length - avg) > tolerance) {
			++vote;
		} else {
			--vote;
		}
	});

	// We are done calculating stuff. Return the types that we found and whether or not
	// we think this sample contains a header.
	var hasHeader = vote > 0;
	return {
		types: types[hasHeader ? 'tail' : 'all'],
		hasHeader: hasHeader
	};
}

module.exports = function() {

	function CSVSniffer(delims) {
		this.delimiters = delims;
	}

    // Expose the function used to accumulate the types to the outside world.
    // Given a current type, and a value, it returns the accumulated type.
    // For example, if the curType is integer and the curValue is 4.4, the result
    // will be float. If curValue in this case would be a string, the result would be a string.
    CSVSniffer.prototype.getAccumulatedType = function(curValue, curType) {
        return getAccumulatedType(curValue, curType);
    };


	// Sniff the given sample, using the given options. See documentation for exact options.

	CSVSniffer.prototype.sniff = function(sample, options) {
		if(!options) {
			var options = {};
		}
		var result = {};
		result.warnings = [];
		result.newlineStr = options.newlineStr || getNewlineStr(sample);
		if(!result.newlineStr) {
			throw new Error("No newline characters found in your file...");
		}
		result.delimiter = options.delimiter;
		if(options.quoteChar === undefined) {
			result.quoteChar = null;
			var quoteAndDelim = guessQuoteAndDelimiter(sample, result.newlineStr, this.delimiters);
			if(quoteAndDelim.delim && (quoteAndDelim.quote == "'" || quoteAndDelim.quote == '"')) {
				result.quoteChar = quoteAndDelim.quote;
				if(options.delimiter === undefined) {
                    // only set result.delimiter if a valid quoteChar was found
					result.delimiter = quoteAndDelim.delim;
				} else if(options.delimiter !== quoteAndDelim.delim) {
					result.warnings.push("Difference found in delimiters. User proposed "+options.delimiter+" but we believe it should be "+quoteAndDelim.delim);
				}
			}
		} else {
			result.quoteChar = options.quoteChar;
		}
		if(!result.delimiter) {
			result.delimiter = guessDelimiter(sample, result.newlineStr, this.delimiters);
		}
		var parsedSample = parseSample(sample, result.newlineStr, result.delimiter, result.quoteChar);
		if(options.hasHeader == undefined) {
			var hasHeaderData = hasHeader(parsedSample);
			result.hasHeader = hasHeaderData.hasHeader;
			result.types = hasHeaderData.types;
		} else {
			result.hasHeader = options.hasHeader;
			result.types = getTypes(parsedSample)[result.hasHeader ? 'tail' : 'all'];
		}
		result.labels = (result.hasHeader && parsedSample.length > 0) ? parsedSample.slice(0, 1)[0] : null;
		result.records = parsedSample;
		if(result.hasHeader && result.records.length > 0) {
			result.records.shift();
		}
		return result;
	}
	return CSVSniffer;
};
