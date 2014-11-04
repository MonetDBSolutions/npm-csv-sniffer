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
 *    Our sniffer also retrieves the newline character as one of [\r\n, \n\r, \n, \r] (in this order)
 *    Our sniffer improves the performance of the delimiter guesser by not traversing every line of the
 *    input for every ASCII character, but rather traversing every line once and incrementing a corresponding
 *    counter for every encountered character.
 *	  We implement a smarter voting mechanism in the hasHeader check. We also accept give header +1 when
 *    the length of the header column is within some tolerance depending on standard deviation of all 
 *    lengths inside this column.
 */


var fs = require('fs');

function getNewlineStr(sample) {
	// Checks the occurrences of possible row delimiters. If multiple row delimiters occur, we fail.
	// The first row delimiter that we find wins
	var winner = null;
	["\r\n", "\n\r", "\n", "\r"].some(function(d) {
		if(sample.indexOf(d) > -1) {
			winner = d;
			return true;
		}
		return false;
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
    exprs.push({
    	expr: new RegExp(
		    	"([^"+nl+"\"'])"	+ // Delimiter
		    	"\\s*?"				+ // Possible whitespace between delimiter and quote char
		    	"([\"'])"			+ // Quote character
		    	"[^"+nl+"]*?"		+ // Non-greedy parsing of string between quotes
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
		    	"[^"+nl+"]*?"		+ // Non-greedy parsing of string between quotes
		    	"\\1"				+ // Matching quote character
		    	"\\s*?"				+ // Possible whitespace between quote char and delimiter
		    	"([^"+nl+"\"'])"	  // Delimiter
	    	, "gm"),
		delimRef: 2,
		quoteRef: 1
	});

	// Add regexp for quotes + delimiter on the left side
	exprs.push({
		expr: new RegExp(
		    	"([^"+nl+"\"'])"	+ // Delimiter
		    	"\\s*?"				+ // Possible whitespace between delimiter and quote char
		    	"([\"'])"			+ // Quote character
		    	"[^"+nl+"]*?"		+ // Non-greedy parsing of string between quotes
		    	"\\2"				+ // Matching quote character
		    	"\\s*?"				+ // Possible whitespace between quote char and end of line
		    	"$"					  // End of line (note that javascript treats the end of every line as $)
	    	, "gm"),
		delimRef: 1,
		quoteRef: 2
	});

	// Add regexp for just quotes
	exprs.push({
		expr: new RegExp(
		    	"^"					+ // Start of line (note that javascript treats the start of every line as ^)
		    	"\\s*?"				+ // Possible whitespace at start of line
		    	"([\"'])"			+ // Quote character
		    	"[^"+nl+"]*?"		+ // Non-greedy parsing of string between quotes
		    	"\\1"				+ // Matching quote character
		    	"\\s*?"				+ // Possible whitespace between quote char and end of line
		    	"$"					  // End of line (note that javascript treats the end of every line as $)
	    	, "gm"),
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
		// for every line, we build an ascii table that keeps the number of occurences
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
		
		// if we arrived here, we are sure that there are at least two entries
		// in the frequency table for this character

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
			if(d.freq == 0 || d.mode <= 0) return;
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

function parseCSVline(line, delimiter, quotechar) {
    // Parsing a line with a regexp to split the columns is tricky, due to
    // the possibility of delimiters inside quoted fields, because the
    // delimiter could be a whitespace character, because a delimiter
    // within quotes can also seem to occur in between values, and many
    // more annoying problems. Therefore, in this function we take another
    // approach to parse a line of CSV. We just walk over the line and
    // remember if we are inside quotes or not (i.e. we use a state machine).
    // We do this in a simplistic way, e.g. we don't handle whitespace
    // between delimiters and opening/closing quotes, we just add
    // that to the values. This is perfectly fine, since for the 
    // statistics this does not change a lot.

    // If no quotechar is given, our task is really easy
    if(!quotechar) {
    	return line.split(delimiter);
    }

    var vals = [];
    var curVal = "";
    var insideQuotes = false;
    for(var i=0; i<line.length; ++i) {
    	var curchar = line.charAt(i);
    	if(curchar == quotechar) {
    		insideQuotes = !insideQuotes;
    		continue;
    	}
    	if(curchar == delimiter && !insideQuotes) {
    		vals.push(curVal);
    		curVal = "";
    		continue;
    	}
    	curVal += curchar;
    }
    vals.push(curVal);
    return vals;
}

function getTypes(lines, delimiter, quotechar) {
	// Parses all lines in the lines array and determines the type of all the columns.
	// Returns three type arrays:
	// - Types considering all rows
	// - Types considering all but the first row
	// - Types considering only the first row

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

    var firstValues = null; // used to calculate the all array in the end
    var first = [];
    var tail = [];
    var all = null; // will be calculated in the end

    lines.forEach(function(line, i) {
    	var cols = parseCSVline(line, delimiter, quotechar);
    	if(i == 0) {
    		firstValues = cols;
    		cols.forEach(function(col, colIndex) {
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
    firstValues.forEach(function(col, i) {
    	all[i] = getAccumulatedType(col, all[i]);
    });

    return {
    	first: first,
    	tail: tail,
    	all: all
    };
}

function hasHeader(sample, newlineStr, delimiter, quotechar) {
	// Figures out the types of data in each column. If any
    // column is of a single type (say, integers), *except* for the first
    // row, then the first row is presumed to be labels. If the type
    // can't be determined, it is assumed to be a string in which case
    // the length of the string is the determining factor: if all of the
    // rows except for the first are the same length, it's a header.
    // Finally, a 'vote' is taken at the end for each column, adding or
    // subtracting from the likelihood of the first row being a header.

    // Split sample into lines
    var lines = sample.split(newlineStr);
 
 	var firstValues = null;
    var lengthsTail = [];

    lines.forEach(function(line, i) {
    	var cols = parseCSVline(line, delimiter, quotechar);
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

    var types = getTypes(lines, delimiter, quotechar);
	// All types and lengths are known, let every col bring out a vote.
	// Whenever the type of the header col differs from the type of the rest of
	// the column (and type of first row is string), this vote is +1. Otherwise, we use the values in the 
	// lengths array to calculate the average and the standard deviation of these
	// lengths. The vote then depends on how close/far it is from the 
	// average. Close to average means negative vote, far from average means positive
	// vote.
	var vote = 0;
	firstValues.forEach(function(col, i) {
		if(types.first[i] != types.tail[i] && types.first[i] == "string") {
			// Yup, first row has different type
			return ++vote;
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

	// The only function in this module does everything, depending on the
	// given options in the optional options object. Options that are not provided
	// are attempted to be auto detected. Possible options:
	// - newlineStr: Line separator in sample
	// - delimiter: Column delimiter in sample (null or )
	// - quoteChar: Quoting character in sample (null or empty string means no quote character)
	// - hasHeader: Boolean indicating whether or not the first line in sample
	//              contains header labels.
	//
	// Returns object with the same properties as those found in the input, 
	// auto filled in whenever they were missing. Whenever auto detection failed,
	// null values are filled in. Note that this could be perfectly fine for e.g. 
	// the quote character. 
	// Furthermore, a types array is in the output, denoting the detected types of the columns.
	// Also, a warning array is added in the output, possibly containing information
	// on mismatches found during the sniffing between the supplied input and
	// what was found during the sniffing.

	CSVSniffer.prototype.sniff = function(sample, options) {
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
			if(quoteAndDelim.delim) {
				result.quoteChar = quoteAndDelim.quote;
				if(options.delimiter === undefined) {
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
		var hasHeaderData = hasHeader(sample, result.newlineStr, result.delimiter, result.quoteChar);
		if(options.hasHeader == undefined) {
			var hasHeaderData = hasHeader(sample, result.newlineStr, result.delimiter, result.quoteChar);
			result.hasHeader = hasHeaderData.hasHeader;
			result.types = hasHeaderData.types;
		} else {
			result.hasHeader = options.hasHeader;
			result.types = getTypes(sample.split(result.newlineStr), result.delimiter, result.quoteChar)[result.hasHeader ? 'tail' : 'all'];
		}
		return result;
	}

	return CSVSniffer;
};
