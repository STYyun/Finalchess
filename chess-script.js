// --- 0. 入場動畫管理 ---
window.addEventListener('load', () => {
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if(splash) {
            splash.style.display = 'none';
        }
        
        const mainWrapper = document.getElementById('main-wrapper');
        if(mainWrapper) {
            mainWrapper.style.animation = 'none';
            mainWrapper.style.filter = 'none';
            mainWrapper.style.transform = 'none';
            mainWrapper.style.opacity = '1';
        }
    }, 5000); 
});

// --- 1. 核心狀態機 (新增 gameMode) ---
const GameState = {
    currentTurn: 'red',
    isTutorialMode: false,
    tutorialStep: 0,
    isGameOver: false,
    gameMode: 'pvp' 
};

let draggedPiece = null;
let originCell = null;

// --- 2. 介面與音效工具 ---
function toggleMenu() { document.getElementById('sidebar').classList.toggle('active'); }

function switchTab(tabId) {
    document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.getElementById('sidebar').classList.remove('active');
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateHUD() {
    document.getElementById('turn-indicator').className = `turn-badge ${GameState.currentTurn}-turn`;
    document.getElementById('turn-indicator').innerText = `目前輪到：${GameState.currentTurn === 'red' ? '紅方' : '黑方'}`;
}

function changeGameMode() {
    const selector = document.getElementById('game-mode');
    if (selector) {
        GameState.gameMode = selector.value;
        setupStandardGame();
    }
}

function playDropSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start(); osc.stop(ctx.currentTime + 0.1);
    } catch(e) {}
}

// --- 3. 走法規則引擎 ---
function isValidMove(piece, startIdx, endIdx, isCapture) {
    if (GameState.isGameOver) return false;
    if (startIdx < 0 || startIdx >= 90 || endIdx < 0 || endIdx >= 90 || startIdx === endIdx) return false;

    const boardCells = document.getElementById('chessboard').children;
    const sCol = startIdx % 9, sRow = Math.floor(startIdx / 9);
    const eCol = endIdx % 9, eRow = Math.floor(endIdx / 9);
    const dx = Math.abs(eCol - sCol), dy = Math.abs(eRow - sRow);
    const text = piece.innerText;
    const isRed = piece.classList.contains('text-red');

    function countBetween() {
        let count = 0;
        if (sRow === eRow) {
            for (let c = Math.min(sCol, eCol) + 1; c < Math.max(sCol, eCol); c++) 
                if (boardCells[sRow * 9 + c].children.length > 0) count++;
        } else if (sCol === eCol) {
            for (let r = Math.min(sRow, eRow) + 1; r < Math.max(sRow, eRow); r++) 
                if (boardCells[r * 9 + sCol].children.length > 0) count++;
        }
        return count;
    }

    if (text === '帥' || text === '將') {
        if (isCapture) {
            const targetText = boardCells[endIdx].children[0].innerText;
            if ((targetText === '帥' || targetText === '將') && sCol === eCol && countBetween() === 0) {
                return true; 
            }
        }
        if (dx + dy !== 1) return false;
        if (eCol < 3 || eCol > 5) return false; 
        if (isRed && eRow < 7) return false;    
        if (!isRed && eRow > 2) return false;
        return true;
    }
    if (text === '仕' || text === '士') {
        if (dx !== 1 || dy !== 1) return false;
        if (eCol < 3 || eCol > 5) return false;
        if (isRed && eRow < 7) return false;
        if (!isRed && eRow > 2) return false;
        return true;
    }
    if (text === '相' || text === '象') {
        if (dx !== 2 || dy !== 2) return false;
        if (isRed && eRow < 5) return false; 
        if (!isRed && eRow > 4) return false; 
        const eyeIdx = ((sRow + eRow) / 2) * 9 + ((sCol + eCol) / 2);
        if (boardCells[eyeIdx].children.length > 0) return false; 
        return true; 
    }
    if (text === '傌' || text === '馬') {
        if (!((dx === 1 && dy === 2) || (dx === 2 && dy === 1))) return false;
        let legRow = sRow, legCol = sCol;
        if (dx === 2) legCol += (eCol > sCol ? 1 : -1); else legRow += (eRow > sRow ? 1 : -1);
        if (boardCells[legRow * 9 + legCol].children.length > 0) return false;
        return true;
    }
    if (text === '俥' || text === '車') return (sRow === eRow || sCol === eCol) && countBetween() === 0;
    if (text === '炮' || text === '包') {
        if (sRow !== eRow && sCol !== eCol) return false;
        return isCapture ? countBetween() === 1 : countBetween() === 0;
    }
    if (text === '兵' || text === '卒') {
        if (dx + dy !== 1) return false;
        if (isRed) {
            if (eRow > sRow) return false; 
            if (sRow > 4 && dx > 0) return false; 
        } else {
            if (eRow < sRow) return false;
            if (sRow < 5 && dx > 0) return false;
        }
        return true;
    }
    return false;
}

// --- 4. 拖放邏輯與通用提交移動 ---
function handleDrop(e) {
    e.preventDefault();
    if (!draggedPiece || GameState.isGameOver) return;

    let targetCell = e.target.classList.contains('cell') ? e.target : e.target.parentElement;
    let targetPiece = e.target.classList.contains('piece') ? e.target : null;

    const boardCells = Array.from(document.getElementById('chessboard').children);
    const startIdx = boardCells.indexOf(originCell);
    const endIdx = boardCells.indexOf(targetCell);

    if (targetPiece) {
        const isDraggedRed = draggedPiece.classList.contains('text-red');
        const isTargetRed = targetPiece.classList.contains('text-red');
        if (isDraggedRed === isTargetRed) return; 
    }

    if (isValidMove(draggedPiece, startIdx, endIdx, !!targetPiece)) {
        if (GameState.isTutorialMode) {
            if (targetPiece) targetCell.removeChild(targetPiece);
            targetCell.appendChild(draggedPiece);
            playDropSound();
            checkTutorialGoal(draggedPiece, endIdx, !!targetPiece);
        } else {
            commitMove(draggedPiece, targetCell, targetPiece);
        }
    }
}

function commitMove(piece, targetCell, targetPiece) {
    if (targetPiece) targetCell.removeChild(targetPiece);
    targetCell.appendChild(piece);
    playDropSound();

    if (targetPiece && (targetPiece.innerText === '帥' || targetPiece.innerText === '將')) {
        GameState.isGameOver = true;
        let winner = piece.classList.contains('text-red') ? '紅方' : '黑方';
        setTimeout(() => { alert(`🎉 恭喜獲勝！${winner}主帥已陣亡。`); setupStandardGame(); }, 100);
    } else {
        GameState.currentTurn = GameState.currentTurn === 'red' ? 'black' : 'red';
        updateHUD();

       
        if (GameState.currentTurn === 'black' && GameState.gameMode !== 'pvp' && !GameState.isTutorialMode) {
            setTimeout(makeAIMove, 600); 
        }
    }
}


const pieceValues = { '將': 10000, '帥': 10000, '車': 900, '俥': 900, '馬': 400, '傌': 400, '包': 450, '炮': 450, '象': 200, '相': 200, '士': 200, '仕': 200, '卒': 100, '兵': 100 };

function getAllLegalMoves(isRed) {
    const moves = [];
    const cells = Array.from(document.getElementById('chessboard').children);
    const pieces = cells.map(c => c.children.length > 0 ? c.children[0] : null);

    for (let i = 0; i < 90; i++) {
        let p = pieces[i];
        if (p && p.classList.contains(isRed ? 'text-red' : 'text-black')) {
            for (let j = 0; j < 90; j++) {
                if (i === j) continue;
                let targetP = pieces[j];
                if (targetP && targetP.classList.contains(isRed ? 'text-red' : 'text-black')) continue; 
                
                if (isValidMove(p, i, j, !!targetP)) {
                    moves.push({ piece: p, startIdx: i, endIdx: j, targetPiece: targetP });
                }
            }
        }
    }
    return moves;
}

function makeAIMove() {
    if (GameState.isGameOver) return;

    const moves = getAllLegalMoves(false); 
    if (moves.length === 0) return; 

    let chosenMove = null;
    const mode = GameState.gameMode;

    if (mode === 'easy') {
       
        chosenMove = moves[Math.floor(Math.random() * moves.length)];
    } 
    else if (mode === 'medium') {
        
        moves.sort((a, b) => {
            let valA = a.targetPiece ? pieceValues[a.targetPiece.innerText] : 0;
            let valB = b.targetPiece ? pieceValues[b.targetPiece.innerText] : 0;
            return valB - valA; 
        });
        let topVal = moves[0].targetPiece ? pieceValues[moves[0].targetPiece.innerText] : 0;
        if (topVal > 0) {
            let bestMoves = moves.filter(m => (m.targetPiece ? pieceValues[m.targetPiece.innerText] : 0) === topVal);
            chosenMove = bestMoves[Math.floor(Math.random() * bestMoves.length)];
        } else {
            chosenMove = moves[Math.floor(Math.random() * moves.length)];
        }
    } 
    else if (mode === 'hard') {
       
        let redMoves = getAllLegalMoves(true); 
        let redAttackedSquares = new Set(redMoves.map(m => m.endIdx));

        moves.forEach(m => {
            let val = m.targetPiece ? pieceValues[m.targetPiece.innerText] : 0;
            m.score = val * 10;
            
            // 鼓勵兵往前衝
            if (m.piece.innerText === '卒') m.score += Math.floor(m.endIdx / 9) * 2; 
            
            // 避免把子送到紅方的攻擊範圍內
            if (redAttackedSquares.has(m.endIdx)) {
                m.score -= pieceValues[m.piece.innerText]; 
            }

            m.score += Math.random() * 5; // 加入微小亂數避免行為過於死板
        });

        moves.sort((a, b) => b.score - a.score);
        chosenMove = moves[0];
    }

    
    if (chosenMove) {
        const targetCell = document.getElementById('chessboard').children[chosenMove.endIdx];
        commitMove(chosenMove.piece, targetCell, chosenMove.targetPiece);
    }
}

// --- 5. 互動教學系統 ---
const tutDialog = document.getElementById('tutorial-dialog');
const tutGoal = document.getElementById('tut-goal');
const tutText = document.getElementById('tut-text');
const tutNext = document.getElementById('tut-btn-next');

function startTutorial() {
    GameState.isTutorialMode = true; 
    GameState.tutorialStep = 0;
    GameState.isGameOver = false;
    switchTab('simulationTab');
    tutDialog.classList.remove('hidden');
    advanceTutorial();
}

function advanceTutorial() {
    GameState.tutorialStep++;
    tutNext.classList.add('hidden'); 
    clearBoard();

    switch(GameState.tutorialStep) {
        case 1:
            createPiece('帥', 'text-red', 85); 
            tutGoal.innerText = "帥 / 將：九宮格內直橫走";
            tutText.innerText = "「帥」與「將」是全軍的主帥，每次只能【直走或橫走一格】，且絕對不能離開畫有 X 線的「九宮格」。\n\n👉 請點擊並將「帥」往上拖曳一格。";
            break;
        case 2:
            createPiece('仕', 'text-red', 86); 
            tutGoal.innerText = "仕 / 士：九宮格內斜走";
            tutText.innerText = "「仕」是主帥的貼身護衛，每次只能在九宮格內的斜線上【走斜線一格】。\n\n👉 請將「仕」沿著斜線往左上方（宮殿中心）移動一格。";
            break;
        case 3:
            createPiece('相', 'text-red', 87); 
            tutGoal.innerText = "相 / 象：走田字不過河";
            tutText.innerText = "「相」負責防守，必須走【對角線兩格】（俗稱走田字），且【絕對不能過河】。\n\n👉 請將「相」往左上方移動一個田字。";
            break;
        case 4:
            createPiece('俥', 'text-red', 89);
            tutGoal.innerText = "俥 / 車：直橫無限制";
            tutText.innerText = "「俥」是威力最強的兵種，只要路線上沒有棋子阻擋，【直線或橫線想走多遠就走多遠】。\n\n👉 請將「俥」直接往前推，直線移動到楚河漢界旁！";
            break;
        case 5:
            createPiece('傌', 'text-red', 88);
            createPiece('炮', 'text-red', 79); 
            tutGoal.innerText = "傌 / 馬：走日字與絆馬腳";
            tutText.innerText = "「傌」走的是【日字對角線】。但是注意！現在傌的正前方有一顆炮「絆住」了馬腳，所以不能往前跳。\n\n👉 請避開前方，將「傌」往左上方或右上方跳躍！";
            break;
        case 6:
            createPiece('炮', 'text-red', 64);
            createPiece('兵', 'text-red', 37); 
            createPiece('馬', 'text-black', 10); 
            tutGoal.innerText = "炮 / 包：隔山打牛";
            tutText.innerText = "「炮」平時移動同車，但要吃子時，中間必須【剛好隔著一顆棋子】（稱為炮架）。\n\n👉 完美的攻擊機會！請用「炮」飛越中間的兵，吃掉對面的黑馬！";
            break;
        case 7:
            createPiece('兵', 'text-red', 40); 
            tutGoal.innerText = "兵 / 卒：過河可平移";
            tutText.innerText = "「兵」永遠不能後退。過河前只能直走；但【過河之後】，就增加了可以【往左或往右】平移的能力！\n\n👉 這顆兵已經過河了，請將它往左或往右移動一格。";
            break;
        case 8:
            createPiece('帥', 'text-red', 76); 
            createPiece('將', 'text-black', 4); 
            tutGoal.innerText = "終極規則：王不見王 (飛將)";
            tutText.innerText = "在標準象棋中，若雙方主帥在同一直線且中間無障礙物，輪到的一方可直接無視距離吃掉對手（飛將）！\n👉 試著把紅「帥」直接拖曳過去，吃掉黑方的「將」！";
            break;
        case 9:
            tutGoal.innerText = "教學完成！";
            tutText.innerText = "恭喜你！你已經親手掌握了所有標準象棋的走法與特殊規則。\n現在準備好迎接真正的挑戰，開始你的象棋對弈之旅吧！";
            tutNext.innerText = "進入實戰盤";
            tutNext.classList.remove('hidden');
            break;
        case 10:
            endTutorial();
            break;
    }
}

function checkTutorialGoal(piece, endIdx, isCapture) {
    const text = piece.innerText;
    
    if (GameState.tutorialStep === 1 && text === '帥') {
        tutText.innerText = "很好！記住主帥永遠不能離開九宮格。";
        tutNext.classList.remove('hidden');
    } 
    else if (GameState.tutorialStep === 2 && text === '仕') {
        tutText.innerText = "漂亮！仕只能在斜線上移動保護主帥。";
        tutNext.classList.remove('hidden');
    } 
    else if (GameState.tutorialStep === 3 && text === '相') {
        tutText.innerText = "正確！相走田字，是堅固的後防力量。";
        tutNext.classList.remove('hidden');
    } 
    else if (GameState.tutorialStep === 4 && text === '俥') {
        tutText.innerText = "太棒了！車的高機動性是進攻的核心。";
        tutNext.classList.remove('hidden');
    }
    else if (GameState.tutorialStep === 5 && text === '傌') {
        tutText.innerText = "聰明！避開被絆住的馬腳，成功跳躍。";
        tutNext.classList.remove('hidden');
    }
    else if (GameState.tutorialStep === 6 && text === '炮' && isCapture) {
        tutText.innerText = "轟！完美的隔山打牛！這就是炮的吃子威力。";
        tutNext.classList.remove('hidden');
    }
    else if (GameState.tutorialStep === 7 && text === '兵') {
        tutText.innerText = "沒錯！過河的卒子能當半個車用，威脅極大！";
        tutNext.classList.remove('hidden');
    }
    else if (GameState.tutorialStep === 8 && isCapture) {
        tutText.innerText = "漂亮！這就是傳說中的飛將斬首！";
        tutNext.classList.remove('hidden');
    }
}

function endTutorial() {
    GameState.isTutorialMode = false;
    tutDialog.classList.add('hidden');
    setupStandardGame();
}

// --- 6. 棋盤生命週期管理 ---
function clearBoard() {
    const board = document.getElementById('chessboard');
    board.innerHTML = '';
    for (let i = 0; i < 90; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.addEventListener('dragover', (e) => e.preventDefault());
        cell.addEventListener('drop', handleDrop);
        board.appendChild(cell);
    }
}

function createPiece(name, colorClass, idx) {
    const p = document.createElement('div');
    p.classList.add('piece', colorClass); p.innerText = name; p.draggable = true;
    p.addEventListener('dragstart', (e) => {
        if (GameState.isGameOver) { e.preventDefault(); return; }
        
       
        if (!GameState.isTutorialMode) {
            if (GameState.gameMode !== 'pvp' && colorClass === 'text-black') {
                e.preventDefault(); return; 
            }
            if ((GameState.currentTurn === 'red' && colorClass === 'text-black') || 
                (GameState.currentTurn === 'black' && colorClass === 'text-red')) {
                e.preventDefault(); return;
            }
        }
        draggedPiece = p; originCell = p.parentElement;
        originCell.classList.add('highlight-origin');
        setTimeout(() => p.style.opacity = '0.5', 0);
    });
    p.addEventListener('dragend', () => {
        if (originCell) originCell.classList.remove('highlight-origin');
        draggedPiece = null; originCell = null;
        p.style.opacity = '1';
    });
    document.getElementById('chessboard').children[idx].appendChild(p);
}

function setupStandardGame() {
    clearBoard(); 
    
    GameState.currentTurn = 'red'; 
    GameState.isTutorialMode = false;
    GameState.isGameOver = false; 
    
    // 初始化下拉選單模式
    const selector = document.getElementById('game-mode');
    if (selector) {
        GameState.gameMode = selector.value;
    }
    
    updateHUD();
    
    // 佈置黑方 (上方)
    createPiece('車', 'text-black', 0); createPiece('馬', 'text-black', 1); createPiece('象', 'text-black', 2);
    createPiece('士', 'text-black', 3); createPiece('將', 'text-black', 4); createPiece('士', 'text-black', 5);
    createPiece('象', 'text-black', 6); createPiece('馬', 'text-black', 7); createPiece('車', 'text-black', 8);
    createPiece('包', 'text-black', 19); createPiece('包', 'text-black', 25);
    createPiece('卒', 'text-black', 27); createPiece('卒', 'text-black', 29); createPiece('卒', 'text-black', 31);
    createPiece('卒', 'text-black', 33); createPiece('卒', 'text-black', 35);

    // 佈置紅方 (下方)
    createPiece('兵', 'text-red', 54); createPiece('兵', 'text-red', 56); createPiece('兵', 'text-red', 58);
    createPiece('兵', 'text-red', 60); createPiece('兵', 'text-red', 62);
    createPiece('炮', 'text-red', 64); createPiece('炮', 'text-red', 70);
    createPiece('俥', 'text-red', 81); createPiece('傌', 'text-red', 82); createPiece('相', 'text-red', 83);
    createPiece('仕', 'text-red', 84); createPiece('帥', 'text-red', 85); createPiece('仕', 'text-red', 86);
    createPiece('相', 'text-red', 87); createPiece('傌', 'text-red', 88); createPiece('俥', 'text-red', 89);
}

setupStandardGame();

// --- 7. 教學資料區 ---
const myData = [
    { text: "花心兵，是中國象棋關於兵（卒）的術語之一，指位於九宮中心的兵（卒），也稱為“宮心兵”，對帥（將）的威脅十分強，很容易造成對方帥（將）被將死或困斃。", imgUrl: "花心兵.png" },
    { text: "特指對局中一方用單兵連續追殺對方將（帥）直至將死的戰術過程。此戰術常見於殘局階段，要求進攻方通過精確的步法調度，使孤兵形成連續將軍態勢，最終迫使對手無路可退。", imgUrl: "獨卒擒王.png" },
    { text: "在將缺乏其他子力保護的時後，使用兩個車上下或左右交錯攻擊。", imgUrl: "雙車錯.png" },
    { text: "兩炮與對方將（帥）併線，前炮成為後炮的炮架，如對方以任何棋子阻擋，則又被前炮照將。", imgUrl: "雙砲軍.png" },
    { text: "悶宮殺成立的條件如下：1.對方當我方砲架的士不能移動2.對方的將或帥不能透過移動來避開砲的攻擊3.對方無法阻擋砲的攻擊4.沒有棋子能消滅砲。", imgUrl: "悶宮.png" },
    { text: "該招由中砲（天砲）加上沉底砲（地砲）構成，可以借用對方士象做砲架，再加上其他子力（以車為常見）輔助。可以對對方將（帥）形成絕殺。類似鐵門閂的變化殺招（同樣都會架中砲）。實現此種殺招與重砲一樣，兩砲任一皆不能被敵方喫掉。", imgUrl: "天地砲.png" },
    { text: "指進到底象前一線位置的馬。是常見的一種殺著。可先將對手一軍，依照必須先保護將軍的規則迫使對手先護將，下一步直接吃掉對方的車。", imgUrl: "臥槽馬.png" },
    { text: "一方的馬在對方九宮的兩個上角中對對方將（帥）形成叫將的局面。", imgUrl: "掛角馬.png" },
    { text: "進到對方士角掛角將軍，並將對方的將（帥）逼到與掛角馬成對角位置的馬，須搭配其他棋子才能絕殺對手。", imgUrl: "八角馬.png" },
    { text: "一方的馬把對方的將（帥）鎖在三樓形成叫殺或絕殺的局面，須搭配其他棋子才能絕殺對手。", imgUrl: "釣魚馬.png" },
    { text: "用一匹馬走到「金鉤馬」位置，另一馬走到「臥槽馬」位置，雙馬相依，互殺威力所構成的互殺法。", imgUrl: "雙馬飲泉.png" },
    { text: "指車在其他子力配合下吃中心士，再將死對方的殺法。", imgUrl: "大膽穿心.png" },
    { text: "該戰術以破士為核心，透過多子協同形成局部兵力優勢。攻擊組合包括兩車一兵或兩兵一車，其中兵卒需逼近九宮發揮類車功能。", imgUrl: "三車鬧士.png" },
    { text: "攻擊一方用馬在對方3、7卒（兵）的位置上限制將（帥）的活動空間，然後用其他子殺死對方。是攻擊暴露於側面的將（帥）最銳利的殺法，故有側面虎之稱。", imgUrl: "側面虎.png" },
    { text: "「拔簧馬」指車或其他子力借馬力抽將得子或者做殺，從而取勝的殺法。", imgUrl: "拔簧馬.png" },
    { text: "在將缺乏其他子力保護的時，使用兩個炮（重炮）和一個車上下或左右交錯攻擊。有時，也可以藉助帥（將）力將車緊貼敵將（帥）完成阻殺。", imgUrl: "夾車砲.png" },
    { text: "一方用車、砲、兵(卒)或雙車、砲聯攻，其中一車在對方九宮內來回打將，因其著法猶如在洞中走來靈去，故名「進洞出洞」殺法。", imgUrl: "進洞出洞.png" },
    { text: "炮鎮住中路，並用受其他棋子保護的車或者兵（卒）堵在敵方將（帥）邊上（對方士的原本位置）配合形成的殺棋。敵方的士因被當頭炮牽制無法吃車或者兵（卒）。通常阻殺棋子會借帥（將）力或者車力完成阻殺。", imgUrl: "鐵門栓.png" },
    { text: "炮、馬與對方將 （帥）併線。馬位於將（帥）前兩格，作炮的炮架，同時限制對方將（帥）的移動。炮位於馬後，絕殺對手。", imgUrl: "馬後炮.png" },
    { text: "如果有兩路同時將軍，稱為「雙將」。在這種情況下，被將軍的一方選擇會被壓縮，甚至走投無路。", imgUrl: "雙將.png" },
    { text: "象棋類遊戲不允許棄權一手，因此若無法移動下一步將立刻導致對局結束，稱為困斃。", imgUrl: "困斃.png" },
    { text: "因規則不允許王見王，此種殺招利用此規則，一方進攻子力在將/帥（多在中路）配合下將死對方。但此舉亦會將其置於無保護之下，導致反被對方將殺，因此有一定風險。", imgUrl: "白臉將.png" }
];
    
function showContent(index) {
    const selectedData = myData[index];
    document.getElementById('text-target').innerText = selectedData.text;
    document.getElementById('img-target').src = selectedData.imgUrl;
    document.getElementById('content-display').style.display = 'block';
}

const myImagesData = [
    { text: "正在循環播放：系列 A (可愛動物)", images: ["雙杯獻酒1.png", "雙杯獻酒2.png", "雙杯獻酒3.png", "雙杯獻酒4.png"] },
    { text: "正在循環播放：系列 A (可愛動物)", images: ["https://picsum.photos/id/10/600/400", "https://picsum.photos/id/15/600/400", "https://picsum.photos/id/28/600/400", "https://picsum.photos/id/16/600/400"] },
    { text: "正在循環播放：系列 A (可愛動物)", images: ["https://picsum.photos/id/103/600/400", "https://picsum.photos/id/104/600/400", "https://picsum.photos/id/115/600/400", "https://picsum.photos/id/122/600/400"] },
];

let timer = null; 

function startIndependentPlay(index) {
    clearInterval(timer);
    const allBoxes = document.querySelectorAll('.content-box');
    allBoxes.forEach(box => box.style.display = 'none');
    const currentBox = document.getElementById(`box-${index}`);
    currentBox.style.display = 'block';

    const currentTextTag = document.getElementById(`text-${index}`);
    const currentImgTag = document.getElementById(`img-${index}`);
    const selectedSeries = myImagesData[index];
    let currentImgIndex = 0;

    currentTextTag.innerText = selectedSeries.text;
    currentImgTag.src = selectedSeries.images[currentImgIndex];

    timer = setInterval(function() {
        currentImgIndex++; 
        if (currentImgIndex < selectedSeries.images.length) {
            currentImgTag.src = selectedSeries.images[currentImgIndex];
        } else {
            clearInterval(timer);
        }
    }, 1500); 
}

function togglePlayMusic() {
    const bgm = document.getElementById('global-bgm');
    const btn = document.getElementById('audio-toggle-btn');
    
    if (!bgm || !btn) return;

    if (bgm.paused) {
        bgm.play().then(() => {
            btn.classList.add('playing');
        }).catch(error => {
            console.log("播放被瀏覽器攔截：", error);
        });
    } else {
        bgm.pause();
        btn.classList.remove('playing');
    }
}

document.addEventListener("DOMContentLoaded", function() {
    const textElements = document.querySelectorAll('.animate-text');
    let globalCharIndex = 0;
    const startDelay = 0; 

    textElements.forEach((element) => {
        const text = element.textContent;
        element.innerHTML = ''; 

        for (let i = 0; i < text.length; i++) {
            const span = document.createElement('span');
            span.textContent = text[i];
            span.classList.add('char');
            span.style.animationDelay = `${startDelay + (globalCharIndex * 0.04)}s`; 
            element.appendChild(span);
            globalCharIndex++;
        }
    });
});