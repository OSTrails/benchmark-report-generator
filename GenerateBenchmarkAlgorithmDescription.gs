/**
 * FAIR Benchmark Assessment Algorithm description generator
 * =========================================================
 * 
 * A Google Apps Script that extracts information from RDF files and FAIRsharing
 * metric records and generates a report in a Google Benchmark Assessment Algorithm Spreadsheet.
 * It processes test description GUIDs in a source sheet, fetches RDF content, extracts metric
 * URLs and descriptions, and retrieves metric names from FAIRsharing records.
 * 
 * CONFIGURATION:
 * --------------
 * Customise the behaviour by editing the CONFIG object below:
 * 
 * - sourceSheetName: Name of the sheet containing the Test URLs (default: "Algorithm")
 * - targetSheetName: Name of the sheet where the report will be written (default: "Description")
 * - sourceColumn: Column containing the hyperlinks (default: "B")
 * - startMarker: Text that marks where to start processing (default: "Test GUID")
 * - stopMarker: Text that marks where to stop processing (default: "Description")
 * - metricNameJsonPath: JSON path to the metric name (default: "metadata.name")
 *   Use dot notation for nested attributes (e.g., "data.attributes.name")
 * 
 * TECHNICAL DETAILS:
 * ------------------
 * The script performs the following steps for each Test GUID link:
 * 1. Extracts the URL from the hyperlink in column B
 * 2. Fetches the RDF content from the Test URL
 * 3. Searches for the Metric URL (https://doi.org/10.25504/FAIRsharing.XXXXXX)
 * 4. Extracts the Test description from the RDF field <http://purl.org/dc/terms/description>
 * 5. Extracts the record ID from the Metric URL
 * 6. Fetches JSON from https://fairsharing.org/FAIRsharing.XXXXXX with Accept: application/json
 * 7. Parses the JSON to extract the Metric name
 * 8. Compiles all data into a report row
 * 
 * /



/**
 * Configuration
 */
const CONFIG = {
  sourceSheetName: 'Algorithm',
  targetSheetName: 'Description',
  sourceColumn: 'B',
  startMarker: 'Test GUID',
  stopMarker: 'Description',
  // Path to the metric name in the JSON response (e.g., 'name' or 'data.attributes.name')
  // Use dot notation for nested attributes
  metricNameJsonPath: 'metadata.name'
};

/**
 * Main function to generate the FAIR Metrics report
 */
function generateFAIRMetricsReport() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getSheetByName(CONFIG.sourceSheetName);
  
  if (!sourceSheet) {
    SpreadsheetApp.getUi().alert(`Error: Sheet "${CONFIG.sourceSheetName}" not found`);
    return;
  }
  
  Logger.log('Starting report generation...');
  
  // Find starting row (row after "Test GUID")
  const startRow = findStartRow(sourceSheet);
  if (!startRow) {
    SpreadsheetApp.getUi().alert(`Error: "${CONFIG.startMarker}" not found in column ${CONFIG.sourceColumn}`);
    return;
  }
  
  Logger.log(`Found start marker at row ${startRow - 1}, will start processing from row ${startRow}`);
  
  // Extract data from links
  const reportData = extractMetricsData(sourceSheet, startRow);
  
  Logger.log(`Extracted ${reportData.length} entries`);
  
  // Create or get target sheet
  const targetSheet = getOrCreateSheet(ss, CONFIG.targetSheetName);
  
  // Write report
  writeReport(targetSheet, reportData);
  
  Logger.log(`Report generation complete. Total entries: ${reportData.length}`);
  SpreadsheetApp.getUi().alert(`Report generated successfully with ${reportData.length} entries in "${CONFIG.targetSheetName}" sheet`);
  
  Logger.log('Script finished successfully');
}

/**
 * Find the row number where "Test GUID" appears in column B
 */
function findStartRow(sheet) {
  const maxRows = sheet.getLastRow();
  Logger.log(`Searching for "${CONFIG.startMarker}" in column ${CONFIG.sourceColumn} (${maxRows} rows)`);
  
  for (let i = 1; i <= maxRows; i++) {
    const value = sheet.getRange(CONFIG.sourceColumn + i).getValue();
    Logger.log(`Row ${i}: "${value}"`);
    
    if (value && value.toString().trim() === CONFIG.startMarker) {
      Logger.log(`Found "${CONFIG.startMarker}" at row ${i}`);
      return i + 1; // Return the row after "Test GUID"
    }
  }
  
  Logger.log(`"${CONFIG.startMarker}" not found`);
  return null;
}

/**
 * Extract metrics data from hyperlinks
 */
function extractMetricsData(sheet, startRow) {
  const data = [];
  let currentRow = startRow;
  const maxRows = sheet.getLastRow();
  
  Logger.log(`Starting data extraction from row ${startRow} to ${maxRows}`);
  
  for (currentRow = startRow; currentRow <= maxRows; currentRow++) {
    const cell = sheet.getRange(CONFIG.sourceColumn + currentRow);
    const value = cell.getValue();
    const formula = cell.getFormula();
    
    Logger.log(`Row ${currentRow}: value="${value}", formula="${formula}"`);
    
    // Stop if we hit "Description" 
    if (value && value.toString().trim() === CONFIG.stopMarker) {
      Logger.log(`Found stop marker "${CONFIG.stopMarker}" at row ${currentRow}`);
      break;
    }
    
    // Stop if empty cell
    if (!value || value.toString().trim() === '') {
      Logger.log(`Empty cell at row ${currentRow}, stopping`);
      break;
    }
    
    // Extract URL from HYPERLINK formula or from rich text
    let testUrl = extractUrlFromFormula(formula);
    
    // If no formula, try getting URL from rich text
    if (!testUrl) {
      const richTextValue = cell.getRichTextValue();
      if (richTextValue) {
        testUrl = richTextValue.getLinkUrl();
      }
    }
    
    // If still no URL, try the value itself if it looks like a URL
    if (!testUrl && value && value.toString().startsWith('http')) {
      testUrl = value.toString();
    }
    
    if (testUrl) {
      Logger.log(`Processing row ${currentRow}: ${testUrl}`);
      
      try {
        // Fetch and parse the RDF
        const rdfContent = fetchUrl(testUrl);
        Logger.log(`Fetched ${rdfContent.length} characters from ${testUrl}`);
        
        // Find Metric URL (starts with https://doi.org/10.25504/FAIRsharing)
        const metricUrl = findMetricUrl(rdfContent);
        Logger.log(`Metric URL: ${metricUrl}`);
        
        // Get Test description from RDF
        const testDescription = extractTestDescription(rdfContent);
        Logger.log(`Test description: ${testDescription ? testDescription.substring(0, 100) : 'Not found'}`);
        
        if (metricUrl) {
          // Extract record ID from metric URL
          const recordId = extractRecordId(metricUrl);
          Logger.log(`Record ID: ${recordId}`);
          
          let metricName = 'N/A';
          if (recordId) {
            // Fetch Metric name from JSON
            metricName = getMetricNameFromJson(recordId);
            Logger.log(`Metric name: ${metricName}`);
          } else {
            Logger.log('Could not extract record ID from metric URL');
          }
          
          data.push({
            metricName: metricName,
            metricUrl: metricUrl,
            testUrl: testUrl,
            testDescription: testDescription || 'N/A'
          });
          
          Logger.log(`Successfully processed row ${currentRow}`);
        } else {
          Logger.log(`No metric URL found for row ${currentRow}`);
        }
        
      } catch (error) {
        Logger.log(`Error processing row ${currentRow}: ${error.message}`);
        data.push({
          metricName: 'Error',
          metricUrl: 'Error',
          testUrl: testUrl,
          testDescription: error.message
        });
      }
      
      // Add delay to avoid rate limiting
      Utilities.sleep(1000);
    } else {
      Logger.log(`No URL found at row ${currentRow}`);
    }
  }
  
  Logger.log(`Data extraction complete. Processed ${currentRow - startRow} rows, found ${data.length} entries`);
  return data;
}

/**
 * Get metric name from FAIRsharing JSON using record ID
 */
function getMetricNameFromJson(recordId) {
  const url = `https://fairsharing.org/FAIRsharing.${recordId}`;
  
  const options = {
    method: 'get',
    headers: {
      'Accept': 'application/json'
    },
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode === 200) {
      const result = JSON.parse(response.getContentText());
      
      // Extract metric name using the configured JSON path
      const metricName = getNestedValue(result, CONFIG.metricNameJsonPath);
      
      if (metricName) {
        return metricName;
      } else {
        Logger.log(`Metric name not found at path: ${CONFIG.metricNameJsonPath}`);
        Logger.log(`Response structure: ${JSON.stringify(result).substring(0, 500)}`);
        // Try to log available top-level keys
        if (typeof result === 'object') {
          Logger.log(`Available top-level keys: ${Object.keys(result).join(', ')}`);
        }
        return 'N/A';
      }
    } else {
      Logger.log(`HTTP error for record ${recordId}: ${responseCode} - ${response.getContentText()}`);
      return 'HTTP Error';
    }
  } catch (error) {
    Logger.log(`Error fetching metric JSON: ${error.message}`);
    return 'Error';
  }
}

/**
 * Extract nested value from object using dot notation path
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : null;
  }, obj);
}

/**
 * Extract record ID from FAIRsharing URL
 */
function extractRecordId(metricUrl) {
  // Extract ID after 'https://doi.org/10.25504/FAIRsharing.' or 'https://fairsharing.org/10.25504/FAIRsharing.'
  const match = metricUrl.match(/FAIRsharing\.(\w+)/i);
  return match ? match[1] : null;
}

/**
 * Extract URL from HYPERLINK formula
 */
function extractUrlFromFormula(formula) {
  if (!formula) return null;
  
  // Match HYPERLINK("url", "text") or similar patterns
  const match = formula.match(/HYPERLINK\s*\(\s*"([^"]+)"/i);
  return match ? match[1] : null;
}

/**
 * Fetch content from URL
 */
function fetchUrl(url) {
  try {
    const response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true
    });
    
    if (response.getResponseCode() === 200) {
      return response.getContentText();
    } else {
      throw new Error(`HTTP ${response.getResponseCode()}`);
    }
  } catch (error) {
    throw new Error(`Failed to fetch ${url}: ${error.message}`);
  }
}

/**
 * Find Metric URL in RDF content
 */
function findMetricUrl(content) {
  // Match both doi.org and fairsharing.org URLs
  const patterns = [
    /https:\/\/doi\.org\/10\.25504\/FAIRsharing\.\w+/g,
    /https:\/\/fairsharing\.org\/10\.25504\/FAIRsharing\.\w+/g
  ];
  
  for (const pattern of patterns) {
    const matches = content.match(pattern);
    if (matches) {
      return matches[0];
    }
  }
  
  return null;
}

/**
 * Extract test description from RDF
 */
function extractTestDescription(content) {
  // Look for <http://purl.org/dc/terms/description> "text between quotes"
  // Pattern matches the field followed by quoted text
  const pattern = /<http:\/\/purl\.org\/dc\/terms\/description>\s+"([^"]*)"/;
  const match = content.match(pattern);
  
  if (match && match[1]) {
    Logger.log(`Found description: ${match[1].substring(0, 100)}...`);
    return match[1].trim();
  }
  
  // Try alternative patterns if the first doesn't work
  const altPatterns = [
    /<dcterms:description[^>]*>"([^"]*)"<\/dcterms:description>/i,
    /<dcterms:description[^>]*>([\s\S]*?)<\/dcterms:description>/i,
    /dcterms:description\s*"([^"]*)"/i
  ];
  
  for (const altPattern of altPatterns) {
    const altMatch = content.match(altPattern);
    if (altMatch && altMatch[1]) {
      Logger.log(`Found description (alt pattern): ${altMatch[1].substring(0, 100)}...`);
      return altMatch[1].trim().replace(/<[^>]*>/g, ''); // Remove any HTML tags
    }
  }
  
  Logger.log('Description not found in RDF');
  return null;
}

/**
 * Extract page title
 */
function extractPageTitle(content) {
  const match = content.match(/<title[^>]*>(.*?)<\/title>/i);
  if (match && match[1]) {
    const title = match[1].trim();
    // Decode HTML entities
    return title.replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"');
  }
  return null;
}

/**
 * Get or create sheet
 */
function getOrCreateSheet(spreadsheet, sheetName) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    Logger.log(`Created new sheet: ${sheetName}`);
  } else {
    // Clear existing content
    sheet.clear();
    Logger.log(`Cleared existing sheet: ${sheetName}`);
  }
  
  return sheet;
}

/**
 * Write report to sheet
 */
function writeReport(sheet, data) {
  // Write headers
  const headers = ['Metric name', 'Metric URL', 'Test URL', 'Test description'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  
  // Write data
  if (data.length > 0) {
    const rows = data.map(item => [
      item.metricName,
      item.metricUrl,
      item.testUrl,
      item.testDescription
    ]);
    
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  
  // Auto-resize columns
  sheet.autoResizeColumns(1, headers.length);
  
  Logger.log(`Report written with ${data.length} rows`);
}

/**
 * Create menu item
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('FAIR Metrics')
    .addItem('Generate Report', 'generateFAIRMetricsReport')
    .addToUi();
}

/**
 * Debug function to check what's in column B
 */
function debugColumnB() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getSheetByName(CONFIG.sourceSheetName);
  
  if (!sourceSheet) {
    Logger.log(`Sheet "${CONFIG.sourceSheetName}" not found`);
    return;
  }
  
  const maxRows = Math.min(20, sourceSheet.getLastRow()); // Check first 20 rows
  
  Logger.log(`Checking first ${maxRows} rows of column ${CONFIG.sourceColumn}:`);
  
  for (let i = 1; i <= maxRows; i++) {
    const cell = sourceSheet.getRange(CONFIG.sourceColumn + i);
    const value = cell.getValue();
    const formula = cell.getFormula();
    const richTextValue = cell.getRichTextValue();
    const linkUrl = richTextValue ? richTextValue.getLinkUrl() : null;
    
    Logger.log(`Row ${i}:`);
    Logger.log(`  Value: "${value}"`);
    Logger.log(`  Formula: "${formula}"`);
    Logger.log(`  Link URL: "${linkUrl}"`);
  }
}