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

sniffResult = sniffer.sniff(sample);

console.log("Sniff result: "+
	"Newline string: "				+sniffResult.newlineStr+
	"Delimiter: "					+sniffResult.delimiter+
	"Quote character: " 			+sniffResult.quoteChar+
	"First line contains labels: "	+sniffResult.hasHeader+
	"Labels: "						+sniffResult.labels+
	"# Records: "					+sniffResult.records.length
);
```


# API

#### CSVSniffer(delims)
The constructor of a CSV sniffer takes one optional argument: an array of possible column delimiters. 
Auto detection will never propose a character outside of this set. If delims is not provided, all
ASCII characters are considered.

#### CSVSniffer.sniff(sample, [options])
This function is the only function in the CSVSniffer object. It operates based on the
given options in the optional options object. Options that are not provided
are attempted to be auto detected. Possible options:

- newlineStr [string]: Line separator in sample
- delimiter [string]: Column delimiter in sample (null or )
- quoteChar [string]: Quoting character in sample (null or empty string means no quote character)
- hasHeader [boolean]: Boolean indicating whether or not the first line in sample contains header labels.
             
<a name="sniffresult"></a>**Returns object with the following properties:**

- newlineStr [string]: If auto detected, will be one of "\r", "\n", "\r\n", "\n\r"
- delimiter [string]: If auto detected, can be any ASCII character. Will be null if no delimiter was found.
- quoteChar [string]: Can be either ' or " or null.
- hasHeader [boolean]: true if first line is treated as header.
- warnings [array]: Can contain some warnings that were generated during the sniffing. Will be empty in most cases.
- types [array]: Contains the types of the columns. One of "string", "float", "integer".
- labels [array]: Contains column labels, taken from the first line of the sample. If 'hasHeader' is false, this variable will be set to null.
- records [array]: Contains the parsed data from the sample, using the information that was found during the sniffing process. This array of arrays will not contain the labels if 'hasHeader' evaluated to true.

**Please report any suggestions/bugs to robin.cijvat@monetdbsolutions.com**
