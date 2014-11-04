# csv-sniffer
[![Build Status](https://travis-ci.org/MonetDB/npm-csv-sniffer.svg)](https://travis-ci.org/MonetDB/npm-csv-sniffer)
[![npm version](https://badge.fury.io/js/csv-sniffer.svg)](http://badge.fury.io/js/csv-sniffer)

Takes a sample of CSV text and tries to guess newline character, col delimiter, quote character, and whether or not the first row in the file contains labels.

# Installation
npm install [-g] csv-sniffer

# Example usage

```
var CSVSniffer = require("csv-sniffer")();

var sniffer = new CSVSniffer();

var sample = obtain_a_sample_somehow();

sniffResult = sniffer.sniff(sample, {
	newlineStr: params.newlineStr,
	delimiter: params.delimiter,
	quoteChar: params.quoteChar,
	hasHeader: params.hasHeader
});
```


# API

#### CSVSniffer(delims)
The constructor of a CSV sniffer takes one optional argument: an array of possible column delimiters. 
Auto detection will never propose a character outside of this set. If delims is not provided, auto detection
might find any ASCII character to be a delimiter.

#### CSVSniffer.sniff(sample, options)
This function is the only function in the CSVSniffer object. It operates based on the
given options in the optional options object. Options that are not provided
are attempted to be auto detected. Possible options:

- newlineStr: Line separator in sample
- delimiter: Column delimiter in sample (null or )
- quoteChar: Quoting character in sample (null or empty string means no quote character)
- hasHeader: Boolean indicating whether or not the first line in sample contains header labels.
             
Returns object with the same properties as those found in the input, 
auto filled in whenever they were missing. Whenever auto detection failed,
null values are filled in. Note that this could be perfectly fine for e.g. 
the quote character. 
Furthermore, a types array is in the output, denoting the detected types of the columns.
Also, a warning array is added in the output, possibly containing information
on mismatches found during the sniffing between the supplied input and
what was found during the sniffing.

**Please report any suggestions/bugs to robin.cijvat@monetdbsolutions.com**
