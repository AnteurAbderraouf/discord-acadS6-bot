// excel.js — READ-ONLY access to listeoptions.xlsx.
// This module never writes to the workbook. It only ever calls XLSX.readFile().
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const filePath = path.join(__dirname, 'listeoptions.xlsx');
const SHEET_NAME = 'Affectation';

// Column indexes in the Affectation sheet (0-based).
const COL = {
  email: 1,
  name: 5,
  matricule: 6,
  sect: 7,
  affectation: 8,
  sectionWeb: 9
};

// matricule -> student record. Built once, rebuilt only if the file changes.
let students = null;
let loadedMtimeMs = 0;

function normalize(value) {
  return String(value == null ? '' : value).replace(/\s+/g, '').trim();
}

function cellText(sheet, row, col) {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
  return cell ? String(cell.v).trim() : '';
}

function loadRoster() {
  let workbook;
  try {
    workbook = XLSX.readFile(filePath); // read-only, never written back
  } catch (err) {
    console.error('[excel] Impossible de lire le fichier Excel:', err.message);
    return null;
  }

  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet || !sheet['!ref']) {
    console.error(`[excel] Feuille "${SHEET_NAME}" introuvable ou vide.`);
    return null;
  }

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const map = new Map();

  for (let row = range.s.r + 1; row <= range.e.r; row++) {
    const matricule = cellText(sheet, row, COL.matricule);
    if (!matricule) continue;

    const key = normalize(matricule);
    if (!key) continue;

    map.set(key, {
      matricule,
      name: cellText(sheet, row, COL.name),
      email: cellText(sheet, row, COL.email),
      sect: cellText(sheet, row, COL.sect),
      affectation: cellText(sheet, row, COL.affectation),
      sectionWeb: cellText(sheet, row, COL.sectionWeb),
      row: row + 1 // 1-based, as shown in Excel
    });
  }

  console.log(`[excel] Roster chargé: ${map.size} matricules depuis ${SHEET_NAME}.`);
  return map;
}

// Reloads only when listeoptions.xlsx has actually changed on disk, so the
// file can be updated while the bot is running without a restart.
function getRoster() {
  let mtimeMs = 0;
  try {
    mtimeMs = fs.statSync(filePath).mtimeMs;
  } catch (err) {
    console.error('[excel] Fichier Excel introuvable:', filePath);
    return students; // fall back to whatever we already have in memory
  }

  if (!students || mtimeMs !== loadedMtimeMs) {
    const fresh = loadRoster();
    if (fresh) {
      students = fresh;
      loadedMtimeMs = mtimeMs;
    }
  }
  return students;
}

// Returns the student record, or null if the matricule is not in the roster.
function findStudent(matricule) {
  const roster = getRoster();
  if (!roster) return null;
  return roster.get(normalize(matricule)) || null;
}

function rosterSize() {
  const roster = getRoster();
  return roster ? roster.size : 0;
}

// Kept for backwards compatibility with the older two-server logic.
function findStudentSectionP(matricule) {
  const s = findStudent(matricule);
  return s ? s.sectionWeb : null;
}
function findStudentAffectation(matricule) {
  const s = findStudent(matricule);
  return s ? s.affectation : null;
}

module.exports = { findStudent, rosterSize, findStudentSectionP, findStudentAffectation };
