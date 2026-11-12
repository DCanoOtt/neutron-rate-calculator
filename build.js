// Builds the single self-contained index.html from src/ (parts are concatenated in the order of src/manifest.json).
// Usage: node build.js [out.html]
const fs = require('fs'), path = require('path');
const root = __dirname, src = path.join(root, 'src');
const parts = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'));
const out = parts.map(p => fs.readFileSync(path.join(src, p), 'utf8')).join('');
const dst = process.argv[2] || path.join(root, 'dist', 'index.html');
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.writeFileSync(dst, out);
console.log('built', dst, out.length, 'bytes from', parts.length, 'parts');
// Node bundle of the pure physics core (no page needed), used by the unit tests: node build.js --core
if (process.argv.includes('--core') || !process.argv[2]) {
  const core = parts.filter(p => p.startsWith('js/core/')).map(p => fs.readFileSync(path.join(src, p), 'utf8')).join('\n');
  const names = ['Store', 'rng32', 'poissonInterval', 'poissonDraw', 'stackFactor', 'exBins', 'exCum', 'exBinSum', 'exUnitsOf', 'exTau', 'exFold', 'exCompute', 'layerOf', 'tgLabel', 'parseTargets', 'integrate',
    'tofNs', 'tofToE', 'interpLin', 'interpLog', 'parseFluxFile', 'parseBgTable', 'parseEffTable', 'gammaP', 'betaOf', 'zaidInfo', 'zaidDecode', 'mtName', 'winComposition', 'winMerge', 'winThin', 'winNtot', 'winParse', 'WIN_MATS', 'WIN_AIR', 'decNum', 'decParse', 'decYields', 'decDaughters', 'decEquil', 'decBateman', 'decRates', 'decIndexText', 'decFileName', 'decZaid', 'decSpectra', 'decBetaBins', 'decHist', 'decEmax', 'decModeName', 'decSigma', 'decErfc'];
  const cj = path.join(root, 'dist', 'core.js');
  fs.writeFileSync(cj, core + '\nmodule.exports = { ' + names.join(', ') + ' };\n');
  console.log('built', cj);
}
