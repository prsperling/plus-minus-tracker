// === FINAL CODE.GS — WITH DNAME + WORKING DEPLOYMENT ===

const DATA_SHEET_NAME = 'Goals';
const ROSTER_SHEET_NAME = 'Roster';
const GAMES_SHEET_NAME = 'Games';

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(DATA_SHEET_NAME);
}

function getRosterSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(ROSTER_SHEET_NAME);
}

function getGamesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(GAMES_SHEET_NAME);
}

// Load roster: number → dname
function getRosterMap() {
  const sheet = getRosterSheet();
  if (!sheet) return {};

  const data = sheet.getDataRange().getValues();
  const map = {};
  data.slice(1).forEach(row => {
    const num = Number(row[0]);
    if (!isNaN(num) && num > 0) {
      map[num] = {
        dname: (row[4] || '').toString().trim() || `#${num}`
      };
    }
  });
  return map;
}

// Serve HTML, manifest, and icons for PWA install (homescreen icon)
function doGet(e) {
  const q = e && e.parameter && e.parameter.q;

  if (q === 'manifest') {
    // Inline icons as data URLs to avoid cross-origin/icon serving issues
    const icon192 = DriveApp.getFileById('1xUL39dIPRjD6Hvl-nuVG0WNxztwshW7Z').getBlob();
    const icon512 = DriveApp.getFileById('1EAR5omr-HZoCrjOgEf21lbZbJKH1-Ixq').getBlob();
    const toDataUrl = blob => `data:${blob.getContentType()};base64,${Utilities.base64Encode(blob.getBytes())}`;

    const manifest = {
      name: 'Plus Minus',
      short_name: 'PlusMinus',
      start_url: '.',
      scope: '.',
      display: 'standalone',
      background_color: '#0066ff',
      theme_color: '#0066ff',
      icons: [
        { src: toDataUrl(icon192), sizes: '192x192', type: 'image/png' },
        { src: toDataUrl(icon512), sizes: '512x512', type: 'image/png' }
      ]
    };
    return ContentService.createTextOutput(JSON.stringify(manifest))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Default: serve the app HTML (update filename if needed)
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Plus Minus')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// CURRENT GAME
function getLivePlusMinus() {
  const data = getSheet().getDataRange().getValues();
  if (data.length <= 1) return { currentGameID: 1, stats: [] };
  const lastID = data[data.length-1][8] || 1;
  return { currentGameID: lastID, stats: calcStats(data, [lastID]) };
}

// LAST 5 + ALL
function getLast5GamesPlusMinus() { return calcStats(getSheet().getDataRange().getValues(), getLastNGameIds(5)); }
function getAllGamesPlusMinus()   { return calcStats(getSheet().getDataRange().getValues(), null); }
function getAllGamesPlusMinusIncludingOdd() { return calcStats(getSheet().getDataRange().getValues(), null, true); }

function getLastNGameIds(n) {
  const data = getSheet().getDataRange().getValues();
  const ids = [...new Set(data.slice(1).map(r => r[8]).filter(Boolean))];
  return ids.slice(-n);
}

// MAIN STATS — WITH DNAME
function calcStats(data, targetGameIds, includeOddMan = false) {
  const rosterMap = getRosterMap();
  const stats = {};

  data.slice(1).forEach(r => {
    const gameId = r[8];
    if (targetGameIds && !targetGameIds.includes(gameId)) return;
    if (r[7] === 'GAME START') return;

    const type = r[6];
    const flag = r[7] || '';
    const isGF = includeOddMan ? type === 'GF' : (type === 'GF' && flag !== 'Iggy PP');
    const isGA = includeOddMan ? type === 'GA' : (type === 'GA' && flag !== 'Iggy SH');
    if (!isGF && !isGA) return;

    r.slice(0,6)
      .filter(x => x !== '')
      .map(x => Number(x))
      .forEach(p => {
        if (!stats[p]) stats[p] = { player: p, gf: 0, ga: 0, pm: 0 };
        if (isGF) { stats[p].gf++; stats[p].pm++; }
        if (isGA) { stats[p].ga++; stats[p].pm--; }
      });
  });

  return Object.values(stats)
    .map(p => {
      const info = rosterMap[p.player] || { dname: `#${p.player}` };
      return {
        player: p.player,
        dname: info.dname,
        pm: p.pm,
        ratio: p.gf === 0 ? '—' : (p.ga / p.gf).toFixed(2)
      };
    })
    .sort((a,b) => a.player - b.player);
}

function getCurrentGameData() {
  const data = getSheet().getDataRange().getValues();
  if (data.length <= 1) return { currentGameID: 1, goals: [] };
  const lastID = data[data.length-1][8] || 1;
  const goals = data.slice(1).filter(r => r[8]==lastID && (r[7]||'')!=='GAME START');
  return { currentGameID: lastID, goals: goals };
}

function startNewGame() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const newID = (data.length>1 && data[data.length-1][8]) ? data[data.length-1][8]+1 : 1;
  const row = new Array(11).fill(''); row[7]='GAME START'; row[8]=newID;
  sheet.appendRow(row);
  return newID;
}

function saveWithGoalTypeFlagAndGameID(numbers, goalType, flag, gameID, period, time) {
  const sheet = getSheet();
  const row = new Array(11).fill('');
  numbers.forEach((n,i)=>row[i]=n);
  row[6]=goalType; row[7]=flag||''; row[8]=gameID; row[9]=period||''; row[10]=time||'';
  const r = sheet.getLastRow()+1;
  sheet.getRange(r,1,1,11).setValues([row]);
  sheet.getRange(r,11).setNumberFormat('@');
  sheet.getRange(r,10).setNumberFormat('@');
}

function getRosterNumbers() {
  const map = getRosterMap();
  return Object.keys(map).map(k => Number(k)).sort((a,b)=>a-b);
}

// Get game results with scores and record
function getGameResults() {
  const gamesSheet = getGamesSheet();
  if (!gamesSheet) return { record: {w: 0, l: 0, t: 0, ot: 0, so: 0}, games: []};
  
  const gamesData = gamesSheet.getDataRange().getValues();
  if (gamesData.length <= 1) return { record: {w: 0, l: 0, t: 0, ot: 0, so: 0}, games: []};
  
  // Find column indices
  const headerRow = gamesData[0];
  const gameDetIdCol = headerRow.indexOf('GameDetID');
  const dateCol = headerRow.indexOf('Date');
  const visitorCol = headerRow.indexOf('Visitor');
  const homeCol = headerRow.indexOf('Home');
  const detailsCol = headerRow.indexOf('Details');
  
  if (gameDetIdCol === -1) return { record: {w: 0, l: 0, t: 0, ot: 0, so: 0}, games: []};
  
  // Get scores from Goals sheet and track which games have 'GAME START'
  const goalsData = getSheet().getDataRange().getValues();
  const gameScores = {};
  const gamePeriods = {};
  const gamesWithStart = new Set(); // Track games that have 'GAME START'
  
  goalsData.slice(1).forEach(r => {
    const gameId = r[8];
    if (!gameId) return;
    
    // Track games that have 'GAME START'
    if (r[7] === 'GAME START') {
      gamesWithStart.add(gameId);
      return;
    }
    
    if (!gameScores[gameId]) {
      gameScores[gameId] = { gf: 0, ga: 0 };
    }
    
    const type = r[6];
    const flag = r[7] || '';
    const period = r[9] || '';
    
    // Track if game went to OT or SO
    if (period === 'OT' && !gamePeriods[gameId]) {
      gamePeriods[gameId] = 'OT';
    }
    if (flag === 'SO' && !gamePeriods[gameId]) {
      gamePeriods[gameId] = 'SO';
    }
    
    // Count ALL goals for final score (including PP and SH)
    const isGF = type === 'GF';
    const isGA = type === 'GA';
    
    if (isGF) gameScores[gameId].gf++;
    if (isGA) gameScores[gameId].ga++;
  });
  
  const TEAM_NAME = 'St. Ignatius Wolfpack (JV)';
  const results = [];
  let record = { w: 0, l: 0, t: 0, ot: 0, so: 0 };
  
  gamesData.slice(1).forEach(row => {
    const gameDetId = row[gameDetIdCol];
    if (!gameDetId) return;
    
    // Only include games that have a 'GAME START' entry
    if (!gamesWithStart.has(gameDetId)) return;
    
    const visitor = visitorCol >= 0 ? (row[visitorCol] || '').toString().trim() : '';
    const home = homeCol >= 0 ? (row[homeCol] || '').toString().trim() : '';
    const date = dateCol >= 0 ? row[dateCol] : '';
    
    // Determine opponent
    const opponent = visitor === TEAM_NAME ? home : visitor;
    if (!opponent) return;
    
    // Get scores for this game
    const scores = gameScores[gameDetId] || { gf: 0, ga: 0 };
    const gf = scores.gf;
    const ga = scores.ga;
    
    // Determine result
    let result = '';
    const periodType = gamePeriods[gameDetId] || '';
    
    if (gf > ga) {
      // Win (regardless of OT/SO)
      result = 'Win';
      record.w++;
    } else if (ga > gf) {
      // Loss - check if OT or SO
      if (periodType === 'SO') {
        result = 'SO Loss';
        record.so++;
      } else if (periodType === 'OT') {
        result = 'OT Loss';
        record.ot++;
      } else {
        result = 'Loss';
        record.l++;
      }
    } else {
      result = 'Tie';
      record.t++;
    }
    
    results.push({
      gameDetId: gameDetId,
      date: date,
      opponent: opponent,
      score: `${gf} - ${ga}`,
      result: result,
      gf: gf,
      ga: ga
    });
  });
  
  // Sort by gameDetId (game number)
  results.sort((a, b) => a.gameDetId - b.gameDetId);
  
  return {
    record: record,
    games: results
  };
}

// Get individual game details with goal log
function getGameDetails(gameDetId) {
  const gamesSheet = getGamesSheet();
  if (!gamesSheet) return null;
  
  const gamesData = gamesSheet.getDataRange().getValues();
  const headerRow = gamesData[0];
  const gameDetIdCol = headerRow.indexOf('GameDetID');
  const dateCol = headerRow.indexOf('Date');
  const visitorCol = headerRow.indexOf('Visitor');
  const homeCol = headerRow.indexOf('Home');
  const locationCol = headerRow.indexOf('Location');
  const detailsCol = headerRow.indexOf('Details');
  const gameTimeCol = headerRow.indexOf('GameTime') !== -1 ? headerRow.indexOf('GameTime') : headerRow.indexOf('Game Time');
  
  if (gameDetIdCol === -1) return null;
  
  // Find the game row
  let gameRow = null;
  for (let i = 1; i < gamesData.length; i++) {
    if (gamesData[i][gameDetIdCol] === gameDetId) {
      gameRow = gamesData[i];
      break;
    }
  }
  
  if (!gameRow) return null;
  
  const TEAM_NAME = 'St. Ignatius Wolfpack (JV)';
  const visitor = visitorCol >= 0 ? (gameRow[visitorCol] || '').toString().trim() : '';
  const home = homeCol >= 0 ? (gameRow[homeCol] || '').toString().trim() : '';
  const opponent = visitor === TEAM_NAME ? home : visitor;
  const date = dateCol >= 0 ? gameRow[dateCol] : '';
  const location = locationCol >= 0 ? (gameRow[locationCol] || '').toString().trim() : '';
  const gameTime = gameTimeCol >= 0 ? (gameRow[gameTimeCol] || '').toString().trim() : '';
  
  // Get all goals for this game
  const goalsData = getSheet().getDataRange().getValues();
  const goals = [];
  
  goalsData.slice(1).forEach(r => {
    if (r[8] === gameDetId && r[7] !== 'GAME START') {
      const type = r[6];
      const flag = r[7] || '';
      const period = r[9] || '';
      const time = r[10] || '';
      const players = r.slice(0, 6).filter(x => x !== '').map(x => Number(x));
      
      if (type === 'GF' || type === 'GA') {
        goals.push({
          type: type,
          flag: flag,
          period: period,
          time: time,
          players: players
        });
      }
    }
  });
  
  return {
    gameDetId: gameDetId,
    opponent: opponent,
    date: date,
    location: location,
    gameTime: gameTime,
    goals: goals
  };
}

// Get list of all game IDs with GAME START (for navigation)
function getGameIdsList() {
  const goalsData = getSheet().getDataRange().getValues();
  const gameIds = [];
  
  goalsData.slice(1).forEach(r => {
    const gameId = r[8];
    if (gameId && r[7] === 'GAME START') {
      gameIds.push(gameId);
    }
  });
  
  return gameIds.sort((a, b) => a - b);
}

// Get player's +/- per game for chart
function getPlayerGameStats(playerNumber) {
  const data = getSheet().getDataRange().getValues();
  const rosterMap = getRosterMap();
  const playerInfo = rosterMap[playerNumber] || { dname: `#${playerNumber}` };
  
  // First, collect all unique game IDs in order
  const allGameIds = [...new Set(data.slice(1).map(r => r[8]).filter(Boolean))].sort((a, b) => a - b);
  
  const gameStats = {};
  
  // Initialize all games with 0 pm
  allGameIds.forEach(gameId => {
    gameStats[gameId] = { gameId: gameId, pm: 0 };
  });
  
  // Process goals and calculate pm for each game
  data.slice(1).forEach(r => {
    const gameId = r[8];
    if (!gameId || r[7] === 'GAME START') return;
    
    const type = r[6];
    const flag = r[7] || '';
    const isGF = type === 'GF' && flag !== 'Iggy PP';
    const isGA = type === 'GA' && flag !== 'Iggy SH';
    
    const players = r.slice(0,6).filter(x => x !== '').map(x => Number(x));
    if (players.includes(playerNumber)) {
      if (isGF) {
        gameStats[gameId].pm++;
      }
      if (isGA) {
        gameStats[gameId].pm--;
      }
    }
  });
  
  // Calculate cumulative pm for each game
  let cumulativePm = 0;
  const games = allGameIds.map(gameId => {
    cumulativePm += gameStats[gameId].pm;
    return {
      gameId: gameId,
      pm: gameStats[gameId].pm,
      cumulativePm: cumulativePm
    };
  });
  
  return {
    player: playerNumber,
    dname: playerInfo.dname,
    games: games
  };
}
