// Generate a scannable PDF417 barcode encoding valid AAMVA driver's-license
// data — a test target for the ID-scan flow (artifacts/studio-gms /scan page).
// The decoded name (John Quincy Doe) exercises parseAamvaName end-to-end.
//
// Usage: node scripts/src/gen-test-pdf417.mjs [outputPath]
import { writeFileSync } from "node:fs";
import bwipjs from "bwip-js";

const LF = "\n";
const CR = "\r";
const RS = "\x1e";

// --- Build the DL subfile body (data elements, LF-separated, CR-terminated) ---
const elements = [
  "DCADM", // vehicle class
  "DCBNONE", // restrictions
  "DCDNONE", // endorsements
  "DBA20301231", // license expiry
  "DCSDOE", // family (last) name        <- parseAamvaName DCS
  "DACJOHN", // first name               <- parseAamvaName DAC
  "DADQUINCY", // middle name            <- parseAamvaName DAD
  "DBD20200101", // issue date
  "DBB19900101", // date of birth
  "DBC1", // sex
  "DAYBRO", // eye color
  "DAU070 IN", // height
  "DAG123 TEST ST", // street
  "DAIANYTOWN", // city
  "DAJTX", // state
  "DAK750010000", // postal code
  "DAQD12345678", // license number
  "DCF12345678", // document discriminator
  "DCGUSA", // country
  "DDEN", // family name truncation
  "DDFN", // first name truncation
  "DDGN", // middle name truncation
];
const subfile = "DL" + elements.join(LF) + CR;

// --- Build the AAMVA header with correct subfile offset/length ---
const IIN = "636000"; // issuer id number (6)
const AAMVA_VERSION = "10"; // (2)
const JURISDICTION_VERSION = "00"; // (2)
const NUM_SUBFILES = "01"; // (2)
const pad4 = (n) => String(n).padStart(4, "0");

// Header layout: "@" LF RS CR "ANSI " IIN ver jur num  <designator>
// The designator is "DL" + offset(4) + length(4); offset points at the subfile.
const headerPrefix = `@${LF}${RS}${CR}ANSI ${IIN}${AAMVA_VERSION}${JURISDICTION_VERSION}${NUM_SUBFILES}`;
const designatorLen = 2 + 4 + 4; // "DL" + offset + length
const offset = headerPrefix.length + designatorLen;
const designator = `DL${pad4(offset)}${pad4(subfile.length)}`;
const aamva = headerPrefix + designator + subfile;

const outPath = process.argv[2] || "attached_assets/pdf417-aamva-test.png";

const png = await bwipjs.toBuffer({
  bcid: "pdf417",
  text: aamva,
  columns: 12, // keep aspect close to a real license strip
  eclevel: 5, // high error correction — robust to screen glare / slight blur
  scaleX: 4,
  scaleY: 4,
  paddingwidth: 20,
  paddingheight: 20,
  backgroundcolor: "FFFFFF",
});

writeFileSync(outPath, png);
console.log(`Wrote ${outPath} (${png.length} bytes)`);
console.log(`Encodes AAMVA name -> "John Quincy Doe"`);
