// ==== CORE BEGIN
const MEV_PER_K = 8.617333262e-11;
const NEUTRON_U = 1.00866491588;
const NAVO = 6.02214076e23;
const NMASS_MEV = 939.56542052;
const CLIGHT = 299792458;

const ELEMENTS = "n H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og".split(' ');

// MCNP numbering of metastable states: ZAID = 1000 Z + A + 300 + 100 m (m = 1, 2, ...), e.g. 95642 = Am-242m. The value A + 300 + 100 m can be read
// in several ways (642 = 242 + 400 or 142 + 500); the reading that is a known nuclide, with the smallest m, is taken.
function zaidDecode(zaid) {
  const mm = /^(\d+)\.(\w+)$/.exec(zaid);
  if (!mm) return null;
  const num = parseInt(mm[1], 10), Z = Math.floor(num / 1000), Ap = num % 1000;
  if (Ap <= 300) return { Z, A: Ap, m: 0 };
  let first = null;
  for (let m = 1; m <= 6; m++) {
    const A = Ap - 300 - 100 * m;
    if (A < Math.max(1, Z)) break;
    if (!first) first = { Z, A, m };
    if (typeof NUC !== 'undefined' && NUC.has(Z * 1000 + A)) return { Z, A, m };
  }
  return first || { Z, A: Math.max(0, Ap - 400), m: 1 };
}
function zaidInfo(zaid) {
  const m = /^(\d+)\.(\w+)$/.exec(zaid);
  if (!m) return { label: zaid, key: zaid.toLowerCase() };
  const dz = zaidDecode(zaid), Z = dz.Z, A = dz.A, meta = dz.m ? (dz.m > 1 ? 'm' + dz.m : 'm') : '';
  const sym = ELEMENTS[Z] || ('Z' + Z);
  const label = A === 0 ? sym + '-nat' : sym + '-' + A + meta;
  return { label, key: (label + ' ' + label.replace('-', '') + ' ' + zaid).toLowerCase() };
}

const SUB = '₀₁₂₃₄₅₆₇₈₉';
function subN(n) { return String(n).split('').map(c => SUB[+c]).join(''); }
const MTN = {
  1: ['(n,tot)', 'total'], 2: ['(n,n)', 'elastic scattering'], 3: ['(n,non)', 'non-elastic, total minus elastic'],
  4: ["(n,n')", 'inelastic, all levels'], 5: ['(n,x)', 'all other reactions'], 11: ['(n,2nd)', ''],
  16: ['(n,2n)', ''], 17: ['(n,3n)', ''], 18: ['(n,f)', 'fission, total'], 19: ['(n,f)', 'first-chance fission'],
  20: ['(n,nf)', 'second-chance fission'], 21: ['(n,2nf)', 'third-chance fission'], 22: ['(n,nα)', ''],
  23: ['(n,n3α)', ''], 24: ['(n,2nα)', ''], 25: ['(n,3nα)', ''], 27: ['(n,abs)', 'absorption'],
  28: ['(n,np)', ''], 29: ['(n,n2α)', ''], 30: ['(n,2n2α)', ''], 32: ['(n,nd)', ''], 33: ['(n,nt)', ''],
  34: ['(n,n³He)', ''], 35: ['(n,nd2α)', ''], 36: ['(n,nt2α)', ''], 37: ['(n,4n)', ''], 38: ['(n,3nf)', ''],
  41: ['(n,2np)', ''], 42: ['(n,3np)', ''], 44: ['(n,n2p)', ''], 45: ['(n,npα)', ''],
  101: ['(n,abs)', 'disappearance (absorption)'], 102: ['(n,γ)', 'radiative capture'], 103: ['(n,p)', ''],
  104: ['(n,d)', ''], 105: ['(n,t)', ''], 106: ['(n,³He)', ''], 107: ['(n,α)', ''], 108: ['(n,2α)', ''],
  109: ['(n,3α)', ''], 111: ['(n,2p)', ''], 112: ['(n,pα)', ''], 113: ['(n,t2α)', ''], 114: ['(n,d2α)', ''],
  115: ['(n,pd)', ''], 116: ['(n,pt)', ''], 117: ['(n,dα)', ''], 152: ['(n,5n)', ''], 153: ['(n,6n)', ''],
  154: ['(n,2nt)', ''], 155: ['(n,tα)', ''], 156: ['(n,4np)', ''], 157: ['(n,3nd)', ''], 158: ['(n,ndα)', ''],
  159: ['(n,2npα)', ''], 160: ['(n,7n)', ''], 161: ['(n,8n)', ''], 162: ['(n,5np)', ''], 163: ['(n,6nd)', ''],
  164: ['(n,7nt)', ''], 165: ['(n,4n³He)', ''], 166: ['(n,5nd)', ''], 167: ['(n,6nt)', ''], 168: ['(n,2n2p)', ''],
  169: ['(n,3nd)', ''], 170: ['(n,4nd)', ''], 171: ['(n,3nt)', ''], 172: ['(n,n³He)', ''], 173: ['(n,nd3He)', ''],
  174: ['(n,nt3He)', ''], 175: ['(n,nt2p)', ''], 176: ['(n,2n³He)', ''], 177: ['(n,3n³He)', ''],
  178: ['(n,4nt)', ''], 179: ['(n,3n2p)', ''], 180: ['(n,3n2α)', ''], 181: ['(n,3nα)', ''],
  182: ['(n,dt)', ''], 183: ['(n,npd)', ''], 184: ['(n,npt)', ''], 185: ['(n,ndt)', ''],
  186: ['(n,np³He)', ''], 187: ['(n,nd³He)', ''], 188: ['(n,nt³He)', ''], 189: ['(n,ntα)', ''],
  190: ['(n,2n2p)', ''], 191: ['(n,p³He)', ''], 192: ['(n,d³He)', ''], 193: ['(n,³Heα)', ''],
  194: ['(n,4n2p)', ''], 195: ['(n,4n2α)', ''], 196: ['(n,4npα)', ''], 197: ['(n,3p)', ''],
  198: ['(n,n3p)', ''], 199: ['(n,3n2pα)', ''], 200: ['(n,5n2p)', '']
};
function mtName(mt) {
  if (MTN[mt]) return { sym: MTN[mt][0], desc: MTN[mt][1] };
  if (mt >= 51 && mt <= 90) return { sym: "(n,n'" + subN(mt - 50) + ')', desc: 'inelastic, level ' + (mt - 50) };
  if (mt === 91) return { sym: "(n,n'c)", desc: 'inelastic, continuum' };
  const ranges = [[600, 'p'], [650, 'd'], [700, 't'], [750, '³He'], [800, 'α']];
  for (const [b, p] of ranges) {
    if (mt >= b && mt <= b + 48) return { sym: '(n,' + p + subN(mt - b) + ')', desc: 'level ' + (mt - b) };
    if (mt === b + 49) return { sym: '(n,' + p + 'c)', desc: 'continuum' };
  }
  if (mt >= 875 && mt <= 890) return { sym: '(n,2n' + subN(mt - 875) + ')', desc: 'level ' + (mt - 875) };
  if (mt === 891) return { sym: '(n,2nc)', desc: 'continuum' };
  return { sym: 'MT' + mt, desc: '' };
}
function mtLabel(r) {
  return 'MT ' + r.mt + ' · ' + r.sym + (r.desc ? ' · ' + r.desc : '') + (r.derived ? ' (derived)' : '');
}

