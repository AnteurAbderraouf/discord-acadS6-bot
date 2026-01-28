// excel.js
const path = require('path');
const XLSX = require('xlsx');

const filePath = path.join(__dirname, 'listeoptions.xlsx');

function getWorkbook() {
  console.log('Chemin du fichier Excel utilisé:', filePath);

  let workbook;
  try {
    workbook = XLSX.readFile(filePath);
  } catch (err) {
    console.error('Erreur lors de la lecture du fichier Excel:', err);
    return null;
  }
  return workbook;
}

// Pour le serveur 1 : Section Prog. Web (colonne J)
function findStudentSectionP(matricule) {
  const workbook = getWorkbook();
  if (!workbook) return null;

  const sheetName = 'Affectation';
  const sheet = workbook.Sheets[sheetName];

  if (!sheet || !sheet['!ref']) {
    console.error('Feuille "Affectation" introuvable ou vide.');
    return null;
  }

  const range = XLSX.utils.decode_range(sheet['!ref']);

  for (let row = range.s.r + 1; row <= range.e.r; row++) {
    const cellMatricule = sheet[XLSX.utils.encode_cell({ r: row, c: 6 })]; // col 7
    if (!cellMatricule) continue;

    const value = String(cellMatricule.v).trim();
    if (value === String(matricule).trim()) {
      const cellSectionP = sheet[XLSX.utils.encode_cell({ r: row, c: 9 })]; // col 10
      const sectionP = cellSectionP ? String(cellSectionP.v).trim() : '';
      console.log('Srv1 - Ligne trouvée pour matricule:', matricule, 'SectionP:', sectionP);
      return sectionP;
    }
  }

  return null;
}

// Pour le serveur 2 : Affectation (colonne I)
function findStudentAffectation(matricule) {
  const workbook = getWorkbook();
  if (!workbook) return null;

  const sheetName = 'Affectation';
  const sheet = workbook.Sheets[sheetName];

  if (!sheet || !sheet['!ref']) {
    console.error('Feuille "Affectation" introuvable ou vide.');
    return null;
  }

  const range = XLSX.utils.decode_range(sheet['!ref']);

  for (let row = range.s.r + 1; row <= range.e.r; row++) {
    const cellMatricule = sheet[XLSX.utils.encode_cell({ r: row, c: 6 })]; // col 7
    if (!cellMatricule) continue;

    const value = String(cellMatricule.v).trim();
    if (value === String(matricule).trim()) {
      const cellAffect = sheet[XLSX.utils.encode_cell({ r: row, c: 8 })]; // col 9: Affectation [file:4]
      const affect = cellAffect ? String(cellAffect.v).trim() : '';
      console.log('Srv2 - Ligne trouvée pour matricule:', matricule, 'Affectation:', affect);
      return affect;
    }
  }

  return null;
}

module.exports = { findStudentSectionP, findStudentAffectation };