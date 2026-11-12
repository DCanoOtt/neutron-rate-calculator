// ---------- Vacuum window: materials, natural isotopic composition, optical depth ----------
// The window only attenuates the beam: tau(E) = n_tot * sigma_bar(E), with sigma_bar = sum over natural isotopes of
// (atom fraction) x (total cross section of that isotope), n_tot the atoms per barn of the window.
// Natural isotopic abundances (atom %) and isotopic masses (u): NIST "Atomic Weights and Isotopic Compositions with Relative Atomic Masses"
// (all elements that have a natural composition; each element is [mass number, abundance %, atomic mass]). The mass of the natural mixture is derived from them.
const WIN_ELEMENTS = {
 1: { s: 'H', iso: [[1,99.9885,1.00782503223],[2,0.0115,2.01410177812]] },
 2: { s: 'He', iso: [[3,0.000134,3.0160293201],[4,99.999866,4.00260325413]] },
 3: { s: 'Li', iso: [[6,7.59,6.0151228874],[7,92.41,7.0160034366]] },
 4: { s: 'Be', iso: [[9,100.0,9.012183065]] },
 5: { s: 'B', iso: [[10,19.9,10.01293695],[11,80.1,11.00930536]] },
 6: { s: 'C', iso: [[12,98.93,12.0],[13,1.07,13.00335483507]] },
 7: { s: 'N', iso: [[14,99.636,14.00307400443],[15,0.364,15.00010889888]] },
 8: { s: 'O', iso: [[16,99.757,15.99491461957],[17,0.038,16.9991317565],[18,0.205,17.99915961286]] },
 9: { s: 'F', iso: [[19,100.0,18.99840316273]] },
 10: { s: 'Ne', iso: [[20,90.48,19.9924401762],[21,0.27,20.993846685],[22,9.25,21.991385114]] },
 11: { s: 'Na', iso: [[23,100.0,22.989769282]] },
 12: { s: 'Mg', iso: [[24,78.99,23.985041697],[25,10.0,24.985836976],[26,11.01,25.982592968]] },
 13: { s: 'Al', iso: [[27,100.0,26.98153853]] },
 14: { s: 'Si', iso: [[28,92.223,27.97692653465],[29,4.685,28.9764946649],[30,3.092,29.973770136]] },
 15: { s: 'P', iso: [[31,100.0,30.97376199842]] },
 16: { s: 'S', iso: [[32,94.99,31.9720711744],[33,0.75,32.9714589098],[34,4.25,33.967867004],[36,0.01,35.96708071]] },
 17: { s: 'Cl', iso: [[35,75.76,34.968852682],[37,24.24,36.965902602]] },
 18: { s: 'Ar', iso: [[36,0.3336,35.967545105],[38,0.0629,37.96273211],[40,99.6035,39.9623831237]] },
 19: { s: 'K', iso: [[39,93.2581,38.9637064864],[40,0.0117,39.963998166],[41,6.7302,40.9618252579]] },
 20: { s: 'Ca', iso: [[40,96.941,39.962590863],[42,0.647,41.95861783],[43,0.135,42.95876644],[44,2.086,43.95548156],[46,0.004,45.953689],[48,0.187,47.95252276]] },
 21: { s: 'Sc', iso: [[45,100.0,44.95590828]] },
 22: { s: 'Ti', iso: [[46,8.25,45.95262772],[47,7.44,46.95175879],[48,73.72,47.94794198],[49,5.41,48.94786568],[50,5.18,49.94478689]] },
 23: { s: 'V', iso: [[50,0.25,49.94715601],[51,99.75,50.94395704]] },
 24: { s: 'Cr', iso: [[50,4.345,49.94604183],[52,83.789,51.94050623],[53,9.501,52.94064815],[54,2.365,53.93887916]] },
 25: { s: 'Mn', iso: [[55,100.0,54.93804391]] },
 26: { s: 'Fe', iso: [[54,5.845,53.93960899],[56,91.754,55.93493633],[57,2.119,56.93539284],[58,0.282,57.93327443]] },
 27: { s: 'Co', iso: [[59,100.0,58.93319429]] },
 28: { s: 'Ni', iso: [[58,68.077,57.93534241],[60,26.223,59.93078588],[61,1.1399,60.93105557],[62,3.6346,61.92834537],[64,0.9255,63.92796682]] },
 29: { s: 'Cu', iso: [[63,69.15,62.92959772],[65,30.85,64.9277897]] },
 30: { s: 'Zn', iso: [[64,49.17,63.92914201],[66,27.73,65.92603381],[67,4.04,66.92712775],[68,18.45,67.92484455],[70,0.61,69.9253192]] },
 31: { s: 'Ga', iso: [[69,60.108,68.9255735],[71,39.892,70.92470258]] },
 32: { s: 'Ge', iso: [[70,20.57,69.92424875],[72,27.45,71.922075826],[73,7.75,72.923458956],[74,36.5,73.921177761],[76,7.73,75.921402726]] },
 33: { s: 'As', iso: [[75,100.0,74.92159457]] },
 34: { s: 'Se', iso: [[74,0.89,73.922475934],[76,9.37,75.919213704],[77,7.63,76.919914154],[78,23.77,77.91730928],[80,49.61,79.9165218],[82,8.73,81.9166995]] },
 35: { s: 'Br', iso: [[79,50.69,78.9183376],[81,49.31,80.9162897]] },
 36: { s: 'Kr', iso: [[78,0.355,77.92036494],[80,2.286,79.91637808],[82,11.593,81.91348273],[83,11.5,82.91412716],[84,56.987,83.9114977282],[86,17.279,85.9106106269]] },
 37: { s: 'Rb', iso: [[85,72.17,84.9117897379],[87,27.83,86.909180531]] },
 38: { s: 'Sr', iso: [[84,0.56,83.9134191],[86,9.86,85.9092606],[87,7.0,86.9088775],[88,82.58,87.9056125]] },
 39: { s: 'Y', iso: [[89,100.0,88.9058403]] },
 40: { s: 'Zr', iso: [[90,51.45,89.9046977],[91,11.22,90.9056396],[92,17.15,91.9050347],[94,17.38,93.9063108],[96,2.8,95.9082714]] },
 41: { s: 'Nb', iso: [[93,100.0,92.906373]] },
 42: { s: 'Mo', iso: [[92,14.53,91.90680796],[94,9.15,93.9050849],[95,15.84,94.90583877],[96,16.67,95.90467612],[97,9.6,96.90601812],[98,24.39,97.90540482],[100,9.82,99.9074718]] },
 44: { s: 'Ru', iso: [[96,5.54,95.90759025],[98,1.87,97.9052868],[99,12.76,98.9059341],[100,12.6,99.9042143],[101,17.06,100.9055769],[102,31.55,101.9043441],[104,18.62,103.9054275]] },
 45: { s: 'Rh', iso: [[103,100.0,102.905498]] },
 46: { s: 'Pd', iso: [[102,1.02,101.9056022],[104,11.14,103.9040305],[105,22.33,104.9050796],[106,27.33,105.9034804],[108,26.46,107.9038916],[110,11.72,109.9051722]] },
 47: { s: 'Ag', iso: [[107,51.839,106.9050916],[109,48.161,108.9047553]] },
 48: { s: 'Cd', iso: [[106,1.25,105.9064599],[108,0.89,107.9041834],[110,12.49,109.90300661],[111,12.8,110.90418287],[112,24.13,111.90276287],[113,12.22,112.90440813],[114,28.73,113.90336509],[116,7.49,115.90476315]] },
 49: { s: 'In', iso: [[113,4.29,112.90406184],[115,95.71,114.903878776]] },
 50: { s: 'Sn', iso: [[112,0.97,111.90482387],[114,0.66,113.9027827],[115,0.34,114.903344699],[116,14.54,115.9017428],[117,7.68,116.90295398],[118,24.22,117.90160657],[119,8.59,118.90331117],[120,32.58,119.90220163],[122,4.63,121.9034438],[124,5.79,123.9052766]] },
 51: { s: 'Sb', iso: [[121,57.21,120.903812],[123,42.79,122.9042132]] },
 52: { s: 'Te', iso: [[120,0.09,119.9040593],[122,2.55,121.9030435],[123,0.89,122.9042698],[124,4.74,123.9028171],[125,7.07,124.9044299],[126,18.84,125.9033109],[128,31.74,127.90446128],[130,34.08,129.906222748]] },
 53: { s: 'I', iso: [[127,100.0,126.9044719]] },
 54: { s: 'Xe', iso: [[124,0.0952,123.905892],[126,0.089,125.9042983],[128,1.9102,127.903531],[129,26.4006,128.9047808611],[130,4.071,129.903509349],[131,21.2324,130.90508406],[132,26.9086,131.9041550856],[134,10.4357,133.90539466],[136,8.8573,135.907214484]] },
 55: { s: 'Cs', iso: [[133,100.0,132.905451961]] },
 56: { s: 'Ba', iso: [[130,0.106,129.9063207],[132,0.101,131.9050611],[134,2.417,133.90450818],[135,6.592,134.90568838],[136,7.854,135.90457573],[137,11.232,136.90582714],[138,71.698,137.905247]] },
 57: { s: 'La', iso: [[138,0.08881,137.9071149],[139,99.91119,138.9063563]] },
 58: { s: 'Ce', iso: [[136,0.185,135.90712921],[138,0.251,137.905991],[140,88.45,139.9054431],[142,11.114,141.9092504]] },
 59: { s: 'Pr', iso: [[141,100.0,140.9076576]] },
 60: { s: 'Nd', iso: [[142,27.152,141.907729],[143,12.174,142.90982],[144,23.798,143.910093],[145,8.293,144.9125793],[146,17.189,145.9131226],[148,5.756,147.9168993],[150,5.638,149.9209022]] },
 62: { s: 'Sm', iso: [[144,3.07,143.9120065],[147,14.99,146.9149044],[148,11.24,147.9148292],[149,13.82,148.9171921],[150,7.38,149.9172829],[152,26.75,151.9197397],[154,22.75,153.9222169]] },
 63: { s: 'Eu', iso: [[151,47.81,150.9198578],[153,52.19,152.921238]] },
 64: { s: 'Gd', iso: [[152,0.2,151.9197995],[154,2.18,153.9208741],[155,14.8,154.9226305],[156,20.47,155.9221312],[157,15.65,156.9239686],[158,24.84,157.9241123],[160,21.86,159.9270624]] },
 65: { s: 'Tb', iso: [[159,100.0,158.9253547]] },
 66: { s: 'Dy', iso: [[156,0.056,155.9242847],[158,0.095,157.9244159],[160,2.329,159.9252046],[161,18.889,160.9269405],[162,25.475,161.9268056],[163,24.896,162.9287383],[164,28.26,163.9291819]] },
 67: { s: 'Ho', iso: [[165,100.0,164.9303288]] },
 68: { s: 'Er', iso: [[162,0.139,161.9287884],[164,1.601,163.9292088],[166,33.503,165.9302995],[167,22.869,166.9320546],[168,26.978,167.9323767],[170,14.91,169.9354702]] },
 69: { s: 'Tm', iso: [[169,100.0,168.9342179]] },
 70: { s: 'Yb', iso: [[168,0.123,167.9338896],[170,2.982,169.9347664],[171,14.09,170.9363302],[172,21.68,171.9363859],[173,16.103,172.9382151],[174,32.026,173.9388664],[176,12.996,175.9425764]] },
 71: { s: 'Lu', iso: [[175,97.401,174.9407752],[176,2.599,175.9426897]] },
 72: { s: 'Hf', iso: [[174,0.16,173.9400461],[176,5.26,175.9414076],[177,18.6,176.9432277],[178,27.28,177.9437058],[179,13.62,178.9458232],[180,35.08,179.946557]] },
 73: { s: 'Ta', iso: [[180,0.01201,179.9474648],[181,99.98799,180.9479958]] },
 74: { s: 'W', iso: [[180,0.12,179.9467108],[182,26.5,181.94820394],[183,14.31,182.95022275],[184,30.64,183.95093092],[186,28.43,185.9543628]] },
 75: { s: 'Re', iso: [[185,37.4,184.9529545],[187,62.6,186.9557501]] },
 76: { s: 'Os', iso: [[184,0.02,183.9524885],[186,1.59,185.953835],[187,1.96,186.9557474],[188,13.24,187.9558352],[189,16.15,188.9581442],[190,26.26,189.9584437],[192,40.78,191.961477]] },
 77: { s: 'Ir', iso: [[191,37.3,190.9605893],[193,62.7,192.9629216]] },
 78: { s: 'Pt', iso: [[190,0.012,189.9599297],[192,0.782,191.9610387],[194,32.86,193.9626809],[195,33.78,194.9647917],[196,25.21,195.96495209],[198,7.356,197.9678949]] },
 79: { s: 'Au', iso: [[197,100.0,196.96656879]] },
 80: { s: 'Hg', iso: [[196,0.15,195.9658326],[198,9.97,197.9667686],[199,16.87,198.96828064],[200,23.1,199.96832659],[201,13.18,200.97030284],[202,29.86,201.9706434],[204,6.87,203.97349398]] },
 81: { s: 'Tl', iso: [[203,29.52,202.9723446],[205,70.48,204.9744278]] },
 82: { s: 'Pb', iso: [[204,1.4,203.973044],[206,24.1,205.9744657],[207,22.1,206.9758973],[208,52.4,207.9766525]] },
 83: { s: 'Bi', iso: [[209,100.0,208.9803991]] },
 90: { s: 'Th', iso: [[232,100.0,232.0380558]] },
 91: { s: 'Pa', iso: [[231,100.0,231.0358842]] },
 92: { s: 'U', iso: [[234,0.0054,234.0409523],[235,0.7204,235.0439301],[238,99.2742,238.0507884]] },
};
for (const z in WIN_ELEMENTS) { const e = WIN_ELEMENTS[z]; e.w = e.iso.reduce((q, i) => q + i[1] * i[2], 0) / 100; }   // atomic mass of the natural mixture (g/mol)
const WIN_Z = Object.fromEntries(Object.entries(WIN_ELEMENTS).map(([z, e]) => [e.s, +z]));
// dens: handbook density (g/cm3); atoms = atoms per formula unit, wt = mass percent (Fe is the balance)
const WIN_MATS = {
  mylar: { name: 'Mylar (polyethylene terephthalate)', short: 'Mylar', dens: 1.39, formula: 'C₁₀H₈O₄', atoms: { C: 10, H: 8, O: 4 },
    src: 'Biaxially oriented PET film (DuPont Mylar), repeat unit C10H8O4; density 1.39 g/cm³ (data sheets quote 1.38–1.40).' },
  be: { name: 'Beryllium', short: 'Be', dens: 1.848, formula: 'Be', atoms: { Be: 1 },
    src: 'Pure beryllium (monoisotopic), 1.848 g/cm³ at room temperature.' },
  kapton: { name: 'Kapton (polyimide)', short: 'Kapton', dens: 1.42, formula: 'C₂₂H₁₀N₂O₅', atoms: { C: 22, H: 10, N: 2, O: 5 },
    src: 'Polyimide film (DuPont Kapton HN), repeat unit C22H10N2O5; density 1.42 g/cm³ (PDG atomic and nuclear properties: mass fractions H 0.0264, C 0.6911, N 0.0733, O 0.2092).' },
  al: { name: 'Aluminium', short: 'Al', dens: 2.699, formula: 'Al', atoms: { Al: 1 },
    src: 'Pure aluminium (monoisotopic), 2.699 g/cm³ at room temperature.' },
  ss304: { name: 'Stainless steel 304 (AISI 304, UNS S30400)', short: 'SS 304', dens: 7.93, formula: 'Fe-Cr-Ni', wt: { Cr: 19, Ni: 9.25, Mn: 1, Si: 0.375, N: 0.05, C: 0.04, P: 0.0225, S: 0.015 },
    src: 'Mid-range of the standard specification (ASTM A240): Cr 18–20, Ni 8–10.5 %; for the elements that only have an upper limit (Mn 2, Si 0.75, N 0.1, C 0.08, P 0.045, S 0.03 %) half of the limit; iron is the balance. Density 7.93 g/cm³ (handbooks give 7.9–8.0).' },
  ss316l: { name: 'Stainless steel 316L (AISI 316L, UNS S31603)', short: 'SS 316L', dens: 7.99, formula: 'Fe-Cr-Ni-Mo', wt: { Cr: 17, Ni: 12, Mo: 2.5, Mn: 1, Si: 0.375, N: 0.05, C: 0.015, P: 0.0225, S: 0.015 },
    src: 'Mid-range of the standard specification (ASTM A240): Cr 16–18, Ni 10–14, Mo 2–3 %; for the elements that only have an upper limit (Mn 2, Si 0.75, N 0.1, C 0.03, P 0.045, S 0.03 %) half of the limit; iron is the balance. Density 7.99 g/cm³ (handbooks give 7.9–8.0).' },
};
// Composition of a window material: elements (mass and atom fractions), natural isotopes (fraction of all atoms) and the mean atomic mass.
// Dry air at sea level (mole fractions: N2 78.084 %, O2 20.946 %, Ar 0.934 %, CO2 0.0412 %), atoms per mole of air; 1.204 kg/m3 at 20 °C and 101.325 kPa.
const WIN_AIR = { name: 'Dry air', short: 'Air', dens: 1.204e-3, formula: 'N₂ 78.084 %, O₂ 20.946 %, Ar 0.934 %, CO₂ 0.0412 % (by volume)',
  atoms: { N: 2 * 0.78084, O: 2 * 0.20946 + 2 * 0.000412, Ar: 0.00934, C: 0.000412 },
  src: 'Dry air at sea level: N₂ 78.084 %, O₂ 20.946 %, Ar 0.934 %, CO₂ 0.0412 % by volume (traces of Ne, He, CH₄, Kr, H₂, Xe, each below 0.002 %, are left out); density 1.204 kg/m³ at 20 °C and 101.325 kPa (1.225 kg/m³ at 15 °C): scale it for another pressure or temperature.' };
// Typed composition: element symbols with numbers, e.g. "C10H8O4", "Fe2 O3", "Fe 0.7 Cr 0.19 Ni 0.11" (a missing number means 1).
// Returns { amounts: {symbol: number} } or { error }.
function winParse(text) {
  const t = String(text || '').trim();
  if (!t) return { error: 'Type the elements and their numbers, for example C10H8O4 or Fe2O3.' };
  const re = /([A-Z][a-z]?)\s*((?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)?/g, amounts = {};
  let m, used = 0;
  while ((m = re.exec(t)) !== null) {
    if (t.slice(used, m.index).replace(/[\s,;+*·-]/g, '')) return { error: 'Cannot read "' + t.slice(used, m.index).trim() + '". Use element symbols with capital letters, for example C10H8O4.' };
    used = re.lastIndex;
    const sym = m[1], n = m[2] === undefined ? 1 : parseFloat(m[2]);
    if (!(sym in WIN_Z)) return { error: '"' + sym + '" is not an element with a natural isotopic composition (or not a symbol).' };
    if (!(n > 0)) return { error: 'The number for ' + sym + ' must be above zero.' };
    amounts[sym] = (amounts[sym] || 0) + n;
  }
  if (t.slice(used).replace(/[\s,;+*·-]/g, '')) return { error: 'Cannot read "' + t.slice(used).trim() + '". Use element symbols with capital letters, for example C10H8O4.' };
  if (!Object.keys(amounts).length) return { error: 'No element found.' };
  return { amounts };
}
// A typed material: custom = { name, text, mode: 'atoms' | 'mass' }; numbers are atoms per formula unit or mass fractions (any scale).
// Density of the pure elements (g/cm3) at about 20 C: solids and liquids (Br, Hg) from standard tables (CRC/WebElements); gases at 20 C and 101.325 kPa.
const WIN_ELDENS = {H: 8.38e-5, He: 1.664e-4, Li: 0.534, Be: 1.848, B: 2.34, C: 2.267, N: 1.165e-3, O: 1.331e-3, F: 1.58e-3, Ne: 8.39e-4, Na: 0.971, Mg: 1.738, Al: 2.699, Si: 2.329, P: 1.82, S: 2.067, Cl: 2.98e-3, Ar: 1.662e-3, K: 0.862, Ca: 1.55, Sc: 2.989, Ti: 4.54, V: 6.11, Cr: 7.15, Mn: 7.44, Fe: 7.874, Co: 8.90, Ni: 8.908, Cu: 8.96, Zn: 7.134, Ga: 5.907, Ge: 5.323, As: 5.727, Se: 4.81, Br: 3.122, Kr: 3.49e-3, Rb: 1.532, Sr: 2.64, Y: 4.469, Zr: 6.506, Nb: 8.57, Mo: 10.22, Ru: 12.37, Rh: 12.41, Pd: 12.02, Ag: 10.49, Cd: 8.65, In: 7.31, Sn: 7.287, Sb: 6.685, Te: 6.24, I: 4.933, Xe: 5.49e-3, Cs: 1.873, Ba: 3.594, La: 6.145, Ce: 6.77, Pr: 6.773, Nd: 7.007, Sm: 7.52, Eu: 5.243, Gd: 7.895, Tb: 8.229, Dy: 8.55, Ho: 8.795, Er: 9.066, Tm: 9.321, Yb: 6.965, Lu: 9.84, Hf: 13.31, Ta: 16.65, W: 19.25, Re: 21.02, Os: 22.59, Ir: 22.56, Pt: 21.45, Au: 19.32, Hg: 13.534, Tl: 11.85, Pb: 11.34, Bi: 9.78, Pa: 15.37, Th: 11.72, U: 19.1};
function winCustomDef(custom) {
  const c = custom || {}, r = winParse(c.text);
  if (r.error) return { error: r.error };
  const name = String(c.name || '').trim() || 'Custom material';
  const o = { name, short: name.length > 14 ? name.slice(0, 13) + '…' : name, dens: NaN, formula: String(c.text).trim(), custom: true,
    src: 'Typed by the user (' + (c.mode === 'mass' ? 'mass fractions' : 'atoms per formula unit') + '); natural isotopic composition of every element (NIST).' };
  if (c.mode === 'mass') o.wt = r.amounts; else o.atoms = r.amounts;
  const ks = Object.keys(r.amounts);
  if (ks.length === 1 && WIN_ELDENS[ks[0]] > 0) { o.dens = WIN_ELDENS[ks[0]]; o.src += ' Monoelemental: density of the pure element (' + (o.dens < 0.01 ? 'gas at 20 °C and 101.325 kPa' : 'about 20 °C') + ').'; }
  return o;
}
function winComposition(key, custom) {
  const M = key === 'custom' ? winCustomDef(custom) : key === 'air' ? WIN_AIR : WIN_MATS[key]; if (!M || M.error) return M ? { error: M.error } : null;
  let mass = {};                                              // element symbol -> mass fraction
  if (M.atoms) {
    let tot = 0; for (const s in M.atoms) tot += M.atoms[s] * WIN_ELEMENTS[WIN_Z[s]].w;
    for (const s in M.atoms) mass[s] = M.atoms[s] * WIN_ELEMENTS[WIN_Z[s]].w / tot;
  } else {
    if (M.custom) { let t = 0; for (const s in M.wt) t += M.wt[s]; for (const s in M.wt) mass[s] = M.wt[s] / t; }
    else { let f = 0; for (const s in M.wt) { mass[s] = M.wt[s] / 100; f += mass[s]; } mass.Fe = 1 - f; }
  }
  let nsum = 0; const amt = {};
  for (const s in mass) { amt[s] = mass[s] / WIN_ELEMENTS[WIN_Z[s]].w; nsum += amt[s]; }
  const elems = [], isos = [];
  const order = Object.keys(mass).sort((a, b) => mass[b] - mass[a]);
  for (const s of order) {
    const Z = WIN_Z[s], x = amt[s] / nsum, E = WIN_ELEMENTS[Z];
    elems.push({ Z, sym: s, mass: mass[s], atom: x, iso: E.iso.map(([A, ab]) => ({ A, abund: ab })) });
    for (const [A, ab] of E.iso) isos.push({ Z, A, sym: s, f: x * ab / 100, abund: ab });
  }
  const Abar = 1 / nsum;                                      // g per mole of atoms
  return { key, name: M.name, short: M.short, formula: M.formula, dens: M.dens, src: M.src, elems, isos, Abar, custom: !!M.custom };
}
// atoms per barn of a slab: density (g/cm3), thickness (um), mean atomic mass (g/mol)
function winNtot(dens, thickUm, Abar) { return (dens > 0 && thickUm > 0 && Abar > 0) ? dens * thickUm * 1e-4 * NAVO / Abar * 1e-24 : 0; }
// sigma_bar(E) = sum f_i sigma_i(E) on the union of all energy grids (parts: [{E, xs, f}]); every table is interpolated linearly in E
// Each part may carry g (group number, default 0): the result has sig (group 0) and sigs[g] (weighted sum of every group).
function winMerge(parts) {
  const ng = 1 + parts.reduce((a, p) => Math.max(a, p.g || 0), 0);
  let n = 0; for (const p of parts) n += p.E.length;
  const all = new Float64Array(n); let k = 0;
  for (const p of parts) { all.set(p.E, k); k += p.E.length; }
  all.sort();
  const E = []; for (let i = 0; i < all.length; i++) if (!i || all[i] > all[i - 1]) E.push(all[i]);
  const N = E.length, sigs = Array.from({ length: ng }, () => new Float64Array(N)), Eg = Float64Array.from(E);
  for (const p of parts) {
    let j = 0; const pe = p.E, px = p.xs, m = pe.length, sig = sigs[p.g || 0];
    for (let i = 0; i < N; i++) {
      const e = Eg[i]; while (j < m - 2 && pe[j + 1] <= e) j++;
      let v;
      if (e <= pe[0]) v = e < pe[0] ? 0 : px[0];
      else if (e >= pe[m - 1]) v = e > pe[m - 1] ? 0 : px[m - 1];
      else { const x0 = pe[j], x1 = pe[j + 1]; v = x1 > x0 ? px[j] + (px[j + 1] - px[j]) * (e - x0) / (x1 - x0) : px[j + 1]; }
      sig[i] += p.f * v;
    }
  }
  return { E: Eg, sig: sigs[0], sigs };
}
// optical depth tau = n sigma_bar thinned with the "swinging door" rule so that linear interpolation stays within tolAbs + tolRel tau
function winThin(E, sig, n, tolAbs, tolRel) {   // defaults: 2e-4 absolute and 2e-4 relative in tau (transmission error below about 4e-4)
  const N = E.length; if (N < 3) return { E: Float64Array.from(E), tau: Float64Array.from(sig, v => v * n), idx: Array.from({ length: N }, (_, i) => i) };
  const ta = tolAbs > 0 ? tolAbs : 2e-4, tr = tolRel > 0 ? tolRel : 2e-4, y = i => n * sig[i];
  const keep = [0]; let a = 0, lo = -Infinity, hi = Infinity;
  for (let j = 1; j < N; j++) {
    const dx = E[j] - E[a], tol = ta + tr * y(j), s0 = (y(j) - tol - y(a)) / dx, s1 = (y(j) + tol - y(a)) / dx;
    const nl = Math.max(lo, s0), nh = Math.min(hi, s1);
    if (nl > nh && j - 1 > a) { keep.push(j - 1); a = j - 1; const d2 = E[j] - E[a], t2 = ta + tr * y(j); lo = (y(j) - t2 - y(a)) / d2; hi = (y(j) + t2 - y(a)) / d2; }
    else { lo = nl; hi = nh; }
  }
  if (keep[keep.length - 1] !== N - 1) keep.push(N - 1);
  const Eo = new Float64Array(keep.length), To = new Float64Array(keep.length);
  keep.forEach((i, q) => { Eo[q] = E[i]; To[q] = y(i); });
  return { E: Eo, tau: To, idx: keep };
}
