/**
 * Normalizes raw scraped data into a common schema.
 * @param {Object} raw - The raw scraped object.
 * @param {String} source - The source cinema string.
 * @returns {Object} The normalized data object.
 */
function cleanMovieName(name) {
  if (!name) return 'N/A';
  return name.replace(/(?:\s|-)*(?:3d|2d|4dx|imax|ice|hindi|tamil|telugu|english|malayalam|kannada|marathi|bengali|punjabi|gujarati|bhojpuri|odia|urdu)+$/gi, '').trim() || 'N/A';
}

function normalizePrice(raw, source) {
  // Default to today's date in YYYY-MM-DD format (IST)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // en-CA gives YYYY-MM-DD

  return {
    cinema: source || raw.cinema,
    location: raw.location,
    movie: cleanMovieName(raw.movie),
    format: raw.format || '2D',
    language: raw.language || '',
    price: Math.round(Number(raw.price)),
    seat_category: raw.seat_category || 'N/A',
    showtime: raw.showtime || '',
    date: raw.date || today,
    scraped_at: new Date().toISOString(),
  };
}

/**
 * Validates that the object has the required fields.
 * @param {Object} obj - The normalized object.
 * @throws {Error} If validation fails.
 */
function validateSchema(obj) {
  const requiredFields = ['cinema', 'location', 'format', 'price'];
  for (const field of requiredFields) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === '') {
      throw new Error(`Validation Error: Missing or null value for required field '${field}'`);
    }
  }

  if (isNaN(obj.price)) {
    throw new Error(`Validation Error: Price must be a valid number`);
  }
}

module.exports = {
  normalizePrice,
  validateSchema
};

// Small test suite executed only when the script is run directly
if (require.main === module) {
  console.log("Running tests for normalize.js...\n");
  let passed = 0;
  let failed = 0;

  // Test 1: Successful normalization and validation with defaults
  try {
    const rawData = {
      location: 'Juhu',
      price: '250.50'
    };
    const normalized = normalizePrice(rawData, 'PVR');
    validateSchema(normalized);

    if (
      normalized.cinema === 'PVR' &&
      normalized.location === 'Juhu' &&
      normalized.movie === 'N/A' &&
      normalized.format === '2D' &&
      normalized.price === 251 &&
      normalized.seat_category === 'N/A' &&
      normalized.scraped_at
    ) {
      console.log("✅ Test 1 (Success Case w/ Defaults): PASS");
      passed++;
    } else {
      console.log("❌ Test 1 (Success Case w/ Defaults): FAIL - Output structure incorrect.");
      console.log(normalized);
      failed++;
    }
  } catch (err) {
    console.log("❌ Test 1 (Success Case w/ Defaults): FAIL - Unexpected error:", err.message);
    failed++;
  }

  // Test 2: Validation failure on missing location
  try {
    const rawData = { price: 300 }; // Missing location
    const normalized = normalizePrice(rawData, 'INOX');
    validateSchema(normalized);
    console.log("❌ Test 2 (Missing Location): FAIL - Should have thrown an error.");
    failed++;
  } catch (err) {
    if (err.message.includes("location")) {
      console.log("✅ Test 2 (Missing Location): PASS");
      passed++;
    } else {
      console.log("❌ Test 2 (Missing Location): FAIL - Threw wrong error:", err.message);
      failed++;
    }
  }

  // Test 3: Validation failure on invalid price (NaN)
  try {
    const rawData = { location: 'Bandra', price: 'Free' };
    const normalized = normalizePrice(rawData, 'MovieMax');
    validateSchema(normalized);
    console.log("❌ Test 3 (Invalid Price): FAIL - Should have thrown an error.");
    failed++;
  } catch (err) {
    if (err.message.toLowerCase().includes("valid number")) {
      console.log("✅ Test 3 (Invalid Price): PASS");
      passed++;
    } else {
      console.log("❌ Test 3 (Invalid Price): FAIL - Threw wrong error:", err.message);
      failed++;
    }
  }

  console.log(`\nTests Completed: ${passed} Passed, ${failed} Failed`);
}
