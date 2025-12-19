# CESSDA Benchmark Assessment Algorithm

This repository contains the source code for the CESSDA Benchmark Assessment
Algorithm report generator

## Description

A Google Apps Script that extracts information from test description files and
FAIRsharing metric records and generates a report in a Google Benchmark
Assessment Algorithm Spreadsheet. It processes test description GUIDs in a
source sheet, fetches RDF content, extracts metric URLs and descriptions, and
retrieves metric names from FAIRsharing records.

## Features

- Automated extraction of FAIR metrics data from RDF files
- Retrieval of metric information from FAIRsharing JSON
- Configurable field extraction from both RDF and JSON sources
- Progress logging and error handling
- Customisable source and target sheet names
- Automatic report generation with formatted output

## How to Use

### 1. Setup

1. Open your Google Benchmark Assessment algorithmn spreadsheet
2. Go to **Extensions > Apps Script**
3. Delete any existing code in the editor
4. Copy and paste the entire script from `GenerateBenchmarkAlgorithmDescription.gs`
5. Click the Save icon (💾) or press `Ctrl+S`
6. Give your project a name (e.g., "FAIR Metrics Report Generator")
7. Close the Apps Script editor

### 2. Prepare Your Spreadsheet

- Ensure the sheet containing the assessment algolrithm is named
  **"Algorithm"** (or configure the name in CONFIG)
- Column B should contain hyperlinks to RDF files (test descriptions)
  in the cells between **"Test GUID"** and **"Description"**
- The script will start processing the GUID in the cell below **"Test GUID"**
- The script will stop processing when it encounters a cell containing
  **"Description"** or an empty cell

### 3. Run the Script

1. Refresh your spreadsheet (you may need to reload the page)
2. A new menu item **"FAIR Metrics"** will appear in the menu bar
3. Click **FAIR Metrics > Generate Report**
4. The script will process each link and display progress in the logs
5. When complete, a popup will show the number of entries processed

### 4. View the Report

The script creates a new sheet called **"Description"** (or configured name)
containing four columns:

- **Metric name**: The full name of the FAIR metric
- **Metric URL**: The FAIRsharing URL (DOI) for the metric
- **Test URL**: The original RDF file URL
- **Test description**: Description extracted from the RDF file

### 5. Troubleshooting

- **To view detailed logs**: Go to Extensions > Apps Script > Executions
  (clock icon)
- **To debug column B**: Run the `debugColumnB()` function from the Apps
  Script editor
- **If the script times out**: You may need to process fewer rows at a time
- **If metric names show "N/A"**: Check the `metricNameJsonPath` configuration

## Configuration

Customise the behaviour by editing the `CONFIG` object in the script:

```javascript
const CONFIG = {
  sourceSheetName: 'Algorithm',        // Source sheet name
  targetSheetName: 'Description',      // Target sheet name
  sourceColumn: 'B',                   // Column with Test GUIDs
  startMarker: 'Test GUID',           // Start marker text
  stopMarker: 'Description',          // Stop marker text
  metricNameJsonPath: 'metadata.name' // JSON path to metric name
};
```

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `sourceSheetName` | Name of the sheet containing the Test URLs | `"Algorithm"` |
| `targetSheetName` | Name of the sheet where the report will be written | `"Description"` |
| `sourceColumn` | Column containing the hyperlinks | `"B"` |
| `startMarker` | Text that marks where to start processing | `"Test GUID"` |
| `stopMarker` | Text that marks where to stop processing | `"Description"` |
| `metricNameJsonPath` | JSON path to the metric name (use dot notation) | `"metadata.name"` |

## Customisation

### A) Extracting More Fields from Metric Records (FAIRsharing JSON)

To add more fields from the FAIRsharing metric JSON to your report:

#### 1. Find the field path in the JSON structure

Example paths from the FAIRsharing JSON:

- `'metadata.abbreviation'` - The metric abbreviation (e.g., "FM Gen2-MI-F1A")
- `'metadata.status'` - The metric status (e.g., "ready")
- `'metadata.homepage'` - The GitHub URL for the metric
- `'metadata.contacts[0].contact_name'` - First contact's name
- `'registry'` - The registry name (e.g., "FAIRassist")

#### 2. In the `getMetricNameFromJson()` function, add extraction for the new field

```javascript
const metricAbbreviation = getNestedValue(result, 'metadata.abbreviation');
const metricStatus = getNestedValue(result, 'metadata.status');
```

#### 3. Return the new fields in the function (modify return statement)

```javascript
return {
  name: metricName,
  abbreviation: metricAbbreviation,
  status: metricStatus
};
```

#### 4. In `extractMetricsData()`, update the `data.push()` to include new fields

```javascript
data.push({
  metricName: metricInfo.name || 'N/A',
  metricAbbreviation: metricInfo.abbreviation || 'N/A',
  metricStatus: metricInfo.status || 'N/A',
  metricUrl: metricUrl,
  testUrl: testUrl,
  testDescription: testDescription || 'N/A'
});
```

#### 5. In `writeReport()`, update the headers array and row mapping

```javascript
const headers = ['Metric name', 'Abbreviation', 'Status', 'Metric URL', 'Test URL', 'Test description'];
const rows = data.map(item => [
  item.metricName,
  item.metricAbbreviation,
  item.metricStatus,
  item.metricUrl,
  item.testUrl,
  item.testDescription
]);
```

### B) Extracting More Information from the RDF

To add more fields from the RDF content to your report:

#### 1. Identify the RDF field you want to extract

Common RDF fields:

- `<http://purl.org/dc/terms/title>` - Title
- `<http://purl.org/dc/terms/creator>` - Creator
- `<http://purl.org/dc/terms/created>` - Creation date
- `<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>` - Type
- `<http://purl.org/dc/terms/identifier>` - Identifier

#### 2. Create a new extraction function (similar to `extractTestDescription`)

```javascript
function extractTestCreator(content) {
  const pattern = /<http:\/\/purl\.org\/dc\/terms\/creator>\s+"([^"]*)"/;
  const match = content.match(pattern);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}
```

#### 3. Call your new function in `extractMetricsData()` after fetching RDF

```javascript
const testCreator = extractTestCreator(rdfContent);
const testCreated = extractTestCreated(rdfContent);
```

#### 4. Add the new fields to `data.push()`

```javascript
data.push({
  metricName: metricName,
  metricUrl: metricUrl,
  testUrl: testUrl,
  testDescription: testDescription || 'N/A',
  testCreator: testCreator || 'N/A',
  testCreated: testCreated || 'N/A'
});
```

#### 5. Update the report headers and row mapping in `writeReport()` as shown above

#### Note on RDF Field Formats

RDF fields can be in different formats. Common patterns to try:

- **Quoted values**: `/<field>\s+"([^"]*)"/`
- **XML-style tags**: `/<field[^>]*>(.*?)<\/field>/`
- **Angle bracket notation**: `/<field>\s+<([^>]+)>/`

Adjust the regex pattern based on your RDF structure.

## Technical Details

The script performs the following steps for each link:

1. Extracts the URL from the hyperlink in column B
2. Fetches the RDF content from the Test URL
3. Searches for the Metric URL (`https://doi.org/10.25504/FAIRsharing.XXXXXX`)
4. Extracts the Test description from the RDF field `<http://purl.org/dc/terms/description>`
5. Extracts the record ID from the Metric URL
6. Fetches JSON from `https://fairsharing.org/FAIRsharing.XXXXXX` with `Accept: application/json`
7. Parses the JSON to extract the Metric name
8. Compiles all data into a report row

## Requirements

- Google Spreadsheet with appropriate permissions
- Internet access for fetching RDF files and FAIRsharing data
- Valid URLs in the source sheet that return RDF content

## Notes

- The script includes a 1-second delay between each URL fetch to avoid rate limiting
- Processing time depends on the number of links (approximately 2-3 seconds per link)
- If a link fails, the error is logged and included in the report
- The script will clear and overwrite the target sheet each time it runs

## Contributing

Please read [CONTRIBUTING](CONTRIBUTING.md) for details on our code of conduct,
and the process for submitting pull requests to us.

## Versioning

See [Semantic Versioning](https://semver.org/) for guidance.

## Contributors

You can find the list of contributors in the [CONTRIBUTORS](CONTRIBUTORS.md) file.

## License

See the [LICENSE](LICENSE.txt) file.

## Citing

See the [CITATION](CITATION.cff) file.
