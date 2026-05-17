document.addEventListener('DOMContentLoaded', () => {
    const boardElement = document.getElementById('board');
    const turnElement = document.getElementById('turn');
    const statusElement = document.getElementById('status');
    const fenElement = document.getElementById('fen-string');
    const startButton = document.getElementById('start-btn');
    const aiEvaluationElement = document.getElementById('ai-evaluation');
    const undoButton = document.getElementById('undo-btn');
    const flipButton = document.getElementById('flip-btn');
    const editBoardButton = document.getElementById('edit-board-btn');
    const loadFenButton = document.getElementById('load-fen-btn');
    const copyFenButton = document.getElementById('copy-fen-btn');
    const aiModeDepthRadio = document.getElementById('ai-mode-depth');
    const aiModeMovetimeRadio = document.getElementById('ai-mode-movetime');
    const aiValueInput = document.getElementById('ai-value-input');
    const piecePalette = document.getElementById('piece-palette');

    // --- 초기 설정 및 상수 --- //
    const PIECE_THEME = 'janggi_kakao_janggi_style_white'; // or 'janggi_wooden'
    const INITIAL_FEN = 'rnba1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBA1ABNR w - - 0 1';
    const ALL_PIECES = ['R', 'N', 'B', 'A', 'K', 'C', 'P', 'r', 'n', 'b', 'a', 'k', 'c', 'p', 'empty']; // empty는 빈 칸

    let board = []; // 10x9 배열로 장기판 상태 저장
    let selectedPiece = null; // { row, col, piece }
    let currentPlayer = 'w'; // 'w' for Han (White), 'b' for Cho (Black)
    let playerTurn = 'w'; // 사용자의 턴 (항상 'w'로 가정, 사용자가 한나라)
    let validMoves = []; // 유효한 이동 경로 저장
    let isEditing = false; // 편집 모드 여부
    let selectedPalettePiece = 'empty'; // 팔레트에서 선택된 기물

    let isBoardFlipped = false; // 보드 뒤집힘 상태 추적
    let gameOver = false; // 게임 종료 여부

    let currentAiMode = 'depth'; // 현재 AI 생각 방식 (depth 또는 movetime)
    let currentAiValue = 10; // 현재 AI 생각 값 (기본값 depth 10)

    // 효과음 객체 생성
    const moveSound = new Audio('/static/audio/move.wav');
    moveSound.load(); // 오디오 파일 사전 로딩

    // --- 헬퍼 함수들 (먼저 정의하여 호출 가능하도록) --- //

    /**
     * 해당 위치가 보드 위에 있는지 확인합니다.
     */
    function isPositionOnBoard(r, c) {
        return r >= 0 && r <= 9 && c >= 0 && c <= 8;
    }

    /**
     * 해당 위치가 유효한지 (보드 안이고, 아군 기물이 없는지) 확인합니다.
     */
    function isPositionValid(r, c, isHan) {
        if (!isPositionOnBoard(r, c)) return false;
        const targetPiece = board[r][c];
        if (targetPiece) {
            const isTargetHan = targetPiece === targetPiece.toUpperCase();
            if (isHan === isTargetHan) return false; // 아군 기물이면 이동 불가
        }
        return true;
    }

    /**
     * 해당 위치가 궁성의 귀인지 확인합니다.
     */
    function isPalaceCorner(r, c) {
        return (r === 0 || r === 2 || r === 7 || r === 9) && (c === 3 || c === 5);
    }

    /**
     * 현재 위치가 궁성 안인지 확인합니다.
     */
    function isPalace(r, c) {
        return (r >= 0 && r <= 2 && c >= 3 && c <= 5) || (r >= 7 && r <= 9 && c >= 3 && c <= 5);
    }

    /**
     * 궁성 내 대각선 이동 방향을 반환합니다.
     */
    function getPalaceDiagonalMoves(r, c) {
        const moves = [];
        // 중앙(1,4 또는 8,4)에 있을 때
        if (c === 4 && (r === 1 || r === 8)) {
            moves.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
        }
        // 귀(0,3 0,5 2,3 2,5 또는 7,3 7,5 9,3 9,5)에 있을 때
        else if ((r === 0 || r === 2 || r === 7 || r === 9) && (c === 3 || c === 5)) {
            const dr = (r === 0 || r === 7) ? 1 : -1;
            const dc = c === 3 ? 1 : -1;
            moves.push([dr, dc]);
        }
        return moves;
    }

    /**
     * 포의 이동 경로를 찾는 헬퍼 함수
     * @param {boolean} isDiagonal - 대각선 이동 여부
     */
    function findCannonMoves(r, c, dr, dc, isHan, moves, isDiagonal = false) {
        let jump = false; // 기물을 한 번 뛰어넘었는지 여부 (산)
        let currentR = r + dr;
        let currentC = c + dc;

        // 궁성 대각선 이동인 경우, 첫 번째 칸에 기물이 있어야 '산'으로 간주
        if (isDiagonal) {
            if (!isPositionOnBoard(currentR, currentC) || !board[currentR][currentC]) {
                return; // 첫 칸에 기물이 없으면 대각선 이동 불가
            }
            // 첫 칸의 기물이 포인지 확인 (포는 포를 넘을 수 없음)
            if (board[currentR][currentC].toLowerCase() === 'c') {
                return; // 포는 포를 넘을 수 없음
            }
            jump = true; // 첫 칸의 기물을 '산'으로 간주
            currentR += dr; // '산'을 넘어서 다음 칸으로 이동
            currentC += dc;
        }

        while (isPositionOnBoard(currentR, currentC)) {
            const targetPiece = board[currentR][currentC];

            if (!jump) {
                // 아직 '산'을 넘기 전 (직선 이동)
                if (targetPiece) {
                    // 포는 포를 넘을 수 없음
                    if (targetPiece.toLowerCase() === 'c') {
                        break; // 이 방향으로 더 이상 탐색 불가
                    }
                    jump = true; // '산'을 찾음
                }
            } else {
                // '산'을 넘은 후
                if (targetPiece) {
                    // 또 다른 기물을 만남
                    const isTargetHan = targetPiece.toUpperCase() === targetPiece;
                    // 아군 기물이 아니면서, 포가 아니어야 잡을 수 있음
                    if (isHan !== isTargetHan && targetPiece.toLowerCase() !== 'c') {
                        moves.push([currentR, currentC]);
                    }
                    break; // 이 방향으로 더 이상 탐색 불가
                } else {
                    // 빈 칸은 이동 가능
                    moves.push([currentR, currentC]);
                }
            }

            // 궁성 대각선 이동은 '산'을 넘은 후 한 칸만 이동
            if (isDiagonal && jump) break;

            currentR += dr;
            currentC += dc;
        }
    }

    /**
     * FEN 문자열을 내부 보드 배열로 변환합니다.
     */
    function fenToBoard(fen) {
        const [placement] = fen.split(' ');
        const newBoard = Array(10).fill(null).map(() => Array(9).fill(null));
        const rows = placement.split('/');

        for (let r = 0; r < 10; r++) {
            const row = rows[r];
            let c = 0;
            for (const char of row) {
                if (isNaN(char)) {
                    newBoard[r][c] = char;
                    c++;
                } else {
                    c += parseInt(char, 10);
                }
            }
        }
        return newBoard;
    }

    /**
     * 현재 보드 상태를 FEN 문자열로 변환합니다.
     */
    function boardToFen() {
        let fen = '';
        for (let r = 0; r < 10; r++) {
            let emptyCount = 0;
            for (let c = 0; c < 9; c++) {
                const piece = board[r][c];
                if (piece) {
                    if (emptyCount > 0) {
                        fen += emptyCount;
                        emptyCount = 0;
                    }
                    fen += piece;
                } else {
                    emptyCount++;
                }
            }
            if (emptyCount > 0) {
                fen += emptyCount;
            }
            if (r < 9) {
                fen += '/';
            }
        }
        return `${fen} ${currentPlayer} - - 0 1`;
    }

    /**
     * 보드와 기물을 화면에 렌더링합니다.
     */
    function renderBoard() {
        boardElement.innerHTML = ''; // Clear previous state

        // 보드판의 각 칸(square)을 먼저 추가합니다.
        // 각 square는 기물과 표시자들의 부모가 됩니다.
        for (let r = 0; r < 10; r++) {
            for (let c = 0; c < 9; c++) {
                const square = document.createElement('div');
                square.classList.add('square');
                square.dataset.row = r;
                square.dataset.col = c;
                boardElement.appendChild(square);

                const piece = board[r][c];
                if (piece) {
                    const pieceElement = createPieceElement(piece, r, c);
                    square.appendChild(pieceElement); // 기물을 square의 자식으로 추가
                }
            }
        }
        console.log("Board rendered.");
    }

    /**
     * 기물 DOM 요소를 생성합니다.
     */
    function createPieceElement(piece, row, col) {
        const pieceElement = document.createElement('div');
        pieceElement.classList.add('piece');
        pieceElement.dataset.piece = piece;
        pieceElement.dataset.row = row;
        pieceElement.dataset.col = col;

        const team = (piece === piece.toUpperCase()) ? 'han' : 'cho';
        let pieceName;
        if (piece.toLowerCase() === 'p') {
            pieceName = (team === 'han') ? 'b' : 'jol';
        }
        else {
            pieceName = getPieceName(piece.toLowerCase());
        }
        pieceElement.style.backgroundImage = `url('/static/img/${PIECE_THEME}/${team}_${pieceName}.svg')`;
        
        return pieceElement;
    }
    
    /**
     * 기물 문자에 해당하는 파일 이름을 반환합니다.
     */
    function getPieceName(p) {
        switch (p) {
            case 'r': return 'cha';
            case 'n': return 'ma';
            case 'b': return 'sang';
            case 'a': return 'sa';
            case 'k': return 'gung';
            case 'c': return 'fo';
            default: return '';
        }
    }

    /**
     * 장기판 클릭 이벤트를 처리합니다.
     */
    function handleBoardClick(e) {
        if (gameOver) return; // 게임 종료 시 클릭 비활성화
        if (isEditing) {
            handleEditBoardClick(e);
            return;
        }

        const target = e.target;
        const square = target.closest('.square'); // square 요소를 찾도록 수정
        if (!square) return;

        const row = parseInt(square.dataset.row, 10);
        const col = parseInt(square.dataset.col, 10);

        const pieceAtClickedPos = board[row][col];
        const isMyPieceAtClickedPos = pieceAtClickedPos && ((playerTurn === 'w' && pieceAtClickedPos === pieceAtClickedPos.toUpperCase()) || (playerTurn === 'b' && pieceAtClickedPos === pieceAtClickedPos.toLowerCase()));

        if (selectedPiece) {
            if (isValidMove(row, col)) {
                movePiece(selectedPiece.row, selectedPiece.col, row, col);
            } else {
                deselectPiece();
                if (isMyPieceAtClickedPos && currentPlayer === playerTurn) { // 추가: 현재 턴과 사용자 턴이 일치할 때만 선택
                    selectPiece(row, col, pieceAtClickedPos);
                }
            }
        } else {
            if (isMyPieceAtClickedPos && currentPlayer === playerTurn) { // 추가: 현재 턴과 사용자 턴이 일치할 때만 선택
                selectPiece(row, col, pieceAtClickedPos);
            }
        }
    }

    /**
     * 기물을 선택하고 유효한 이동 경로를 표시합니다.
     */
    function selectPiece(row, col, piece) {
        deselectPiece();
        selectedPiece = { row, col, piece };
        validMoves = getValidMoves(row, col, piece);

        // 선택된 square에 selection-indicator 추가
        const targetSquare = boardElement.querySelector(`.square[data-row='${row}'][data-col='${col}']`);
        if (targetSquare) {
            const selectionIndicator = document.createElement('div');
            selectionIndicator.className = 'selection-indicator';
            targetSquare.appendChild(selectionIndicator); // square의 자식으로 추가
        }
        
        console.log(`Selected: ${piece} at (${row}, ${col}). Indicator added.`);
        showValidMoves(validMoves);
    }

    /**
     * 기물 선택을 취소합니다.
     */
    function deselectPiece() {
        clearValidMoves();
        const indicator = boardElement.querySelector('.selection-indicator');
        if (indicator) {
            indicator.remove();
        }
        selectedPiece = null;
        validMoves = [];
    }

    /**
     * 유효한 이동 경로를 UI에 표시합니다.
     */
    function showValidMoves(moves) {
        console.log(`Showing ${moves.length} valid moves.`);
        for (const move of moves) {
            const [r, c] = move;
            const targetSquare = boardElement.querySelector(`.square[data-row='${r}'][data-col='${c}']`);
            if (targetSquare) {
                const moveHighlighter = document.createElement('div');
                moveHighlighter.classList.add('highlight-move');
                targetSquare.appendChild(moveHighlighter); // square의 자식으로 추가
            }
        }
    }

    /**
     * UI에서 유효 이동 경로 표시를 모두 제거합니다.
     */
    function clearValidMoves() {
        const highlights = boardElement.querySelectorAll('.highlight-move');
        highlights.forEach(h => h.remove());
    }

    /**
     * 클릭한 위치가 유효한 이동인지 확인합니다.
     */
    function isValidMove(toRow, toCol) {
        return validMoves.some(move => move[0] === toRow && move[1] === toCol);
    }

    /**
     * 기물을 이동합니다.
     */
    async function movePiece(fromRow, fromCol, toRow, toCol) {
        moveSound.play().catch(e => console.log("Audio play failed on user move:", e));
        const pieceToMove = board[fromRow][fromCol];
        board[toRow][toCol] = pieceToMove;
        board[fromRow][fromCol] = null;

        deselectPiece();
        renderBoard();

        currentPlayer = (currentPlayer === 'w') ? 'b' : 'w';
        updateStatus();
        checkGameStatus(); // 사용자 이동 후 게임 상태 확인
        
        // AI 턴이면 AI 이동 실행
        if (currentPlayer !== playerTurn) {
            setTimeout(getAiMove, 500); // 약간의 딜레이 후 AI 이동
        }
    }

    /**
     * 서버에 AI의 다음 수를 요청합니다.
     */
    async function getAiMove() {
        statusElement.textContent = 'AI가 생각 중입니다...';
        const currentFen = boardToFen();
        fenElement.value = currentFen;

        try {
            const response = await fetch('/get_ai_move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    fen: currentFen,
                    ai_mode: currentAiMode,
                    ai_value: currentAiValue
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Server error');
            }

            const data = await response.json();
            if (data.bestmove) {
                applyAiMove(data.bestmove);
                aiEvaluationElement.textContent = data.score || 'N/A';
            }
        } catch (error) {
            console.error('Error getting AI move:', error);
            statusElement.textContent = `오류: ${error.message}`;
        }
    }

    /**
     * 서버에서 게임 상태(종료 여부)를 확인합니다.
     */
    function checkGameStatus() {
        const currentFen = boardToFen();
        fetch('/get_game_status', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fen: currentFen })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'checkmate') {
                gameOver = true;
                const winner = data.winner === 'cho' ? '초(楚)' : '한(漢)';
                statusElement.textContent = `외통! ${winner}가 승리했습니다.`;
                alert(`외통! ${winner}가 승리했습니다.`);
            } else if (data.status === 'stalemate') {
                gameOver = true;
                statusElement.textContent = '멍군! 무승부입니다.';
                alert('멍군! 무승부입니다.');
            } else if (data.status === 'check') {
                statusElement.textContent = '장군!';
            }
        })
        .catch(error => {
            console.error('Error checking game status:', error);
        });
    }

    /**
     * AI의 수를 보드에 적용합니다.
     */
    function applyAiMove(uciMove) {
        let splitIndex = -1;
        for (let i = 1; i < uciMove.length; i++) {
            if (isNaN(parseInt(uciMove[i], 10))) {
                splitIndex = i;
                break;
            }
        }

        if (splitIndex === -1) {
            console.error(`Invalid UCI move format: ${uciMove}`);
            statusElement.textContent = `오류: 잘못된 AI 이동 형식입니다.`;
            return;
        }

        const fromStr = uciMove.substring(0, splitIndex);
        const toStr = uciMove.substring(splitIndex);

        const fromCol = fromStr.charCodeAt(0) - 'a'.charCodeAt(0);
        const fromRow = 10 - parseInt(fromStr.substring(1), 10);
        const toCol = toStr.charCodeAt(0) - 'a'.charCodeAt(0);
        const toRow = 10 - parseInt(toStr.substring(1), 10);

        console.log(`AI Move (UCI): ${uciMove} -> ((${fromRow},${fromCol}) to (${toRow},${toCol}))`);

        if (fromRow < 0 || fromRow > 9 || toRow < 0 || toRow > 9 || isNaN(fromRow) || isNaN(toRow)) {
            console.error(`Invalid row index calculated from UCI: ${uciMove}`);
            statusElement.textContent = `오류: AI 좌표 계산 오류입니다.`;
            return;
        }

        const piece = board[fromRow][fromCol];
        if (!piece) {
            console.error("AI tried to move a non-existent piece.");
            statusElement.textContent = `오류: AI가 존재하지 않는 기물을 움직이려 합니다.`;
            currentPlayer = 'w';
            updateStatus();
            return;
        }

        board[toRow][toCol] = piece;
        board[fromRow][fromCol] = null;

        moveSound.play().catch(e => console.log("Audio play failed on AI move:", e));

        renderBoard();
        currentPlayer = (currentPlayer === 'w') ? 'b' : 'w';
        updateStatus();
        checkGameStatus(); // AI 이동 후 게임 상태 확인
    }

    /**
     * 게임 상태 정보를 업데이트합니다.
     */
    function updateStatus() {
        const userSideName = (playerTurn === 'w') ? '한나라' : '초나라';
        const aiSideName = (playerTurn === 'w') ? '초나라' : '한나라';

        turnElement.textContent = (currentPlayer === playerTurn) ? `${userSideName} (당신)` : `${aiSideName} (AI)`;
        fenElement.value = boardToFen();
        if (currentPlayer === playerTurn) {
            statusElement.textContent = '당신 차례입니다.';
        } else {
            statusElement.textContent = 'AI 차례입니다.';
        }
    }

    /**
     * 기물의 유효한 모든 이동 경로를 계산합니다.
     */
    function getValidMoves(row, col, piece) {
        const moves = [];
        const pieceType = piece.toLowerCase();
        const isHan = piece === piece.toUpperCase();

        switch (pieceType) {
            case 'p': // 병(P) / 졸(p)
                const forwardPawn = isHan ? -1 : 1;

                // 1. 한 칸 전진
                const forwardPosPawn = [row + forwardPawn, col];
                if (isPositionValid(forwardPosPawn[0], forwardPosPawn[1], isHan)) {
                    moves.push(forwardPosPawn);
                }

                // 2. 좌우 이동
                const leftPosPawn = [row, col - 1];
                if (isPositionValid(leftPosPawn[0], leftPosPawn[1], isHan)) {
                    moves.push(leftPosPawn);
                }
                const rightPosPawn = [row, col + 1];
                if (isPositionValid(rightPosPawn[0], rightPosPawn[1], isHan)) {
                    moves.push(rightPosPawn);
                }

                // 3. 궁성 내 대각선 이동
                const inOpponentPalacePawn = isHan ? (row <= 2 && col >= 3 && col <= 5) : (row >= 7 && col >= 3 && col <= 5);
                if (inOpponentPalacePawn) {
                    // 궁성 중앙에서 귀로
                    if (col === 4 && (row === 1 || row === 8)) {
                        [[row - 1, col - 1], [row - 1, col + 1], [row + 1, col - 1], [row + 1, col + 1]].forEach(m => {
                             if (isPositionValid(m[0], m[1], isHan) && isPalaceCorner(m[0], m[1])) moves.push(m);
                        });
                    }
                    // 궁성 귀에서 중앙으로
                    if (isPalaceCorner(row, col)) {
                        const centerPosPawn = [isHan ? 1 : 8, 4];
                        if (isPositionValid(centerPosPawn[0], centerPosPawn[1], isHan)) {
                            moves.push(centerPosPawn);
                        }
                    }
                }
                break;
            case 'n': // 마(N, n)
                const knightMoves = [
                    // 위로 한 칸 (멱) -> 대각선 한 칸
                    { step: [-1, 0], final_dest_offsets: [[-2, -1], [-2, 1]] },
                    // 아래로 한 칸 (멱) -> 대각선 한 칸
                    { step: [1, 0], final_dest_offsets: [[2, -1], [2, 1]] },
                    // 왼쪽으로 한 칸 (멱) -> 대각선 한 칸
                    { step: [0, -1], final_dest_offsets: [[-1, -2], [1, -2]] },
                    // 오른쪽으로 한 칸 (멱) -> 대각선 한 칸
                    { step: [0, 1], final_dest_offsets: [[-1, 2], [1, 2]] },
                ];

                knightMoves.forEach(move => {
                    const stepRow = row + move.step[0];
                    const stepCol = col + move.step[1];

                    // 경유지가 보드 안이고 비어있는지 확인 (멱 체크)
                    if (isPositionOnBoard(stepRow, stepCol) && board[stepRow][stepCol] === null) {
                        move.final_dest_offsets.forEach(d => {
                            const destRow = row + d[0];
                            const destCol = col + d[1];
                            if (isPositionValid(destRow, destCol, isHan)) {
                                moves.push([destRow, destCol]);
                            }
                        });
                    }
                });
                break;
            case 'c': // 포(C, c)
                const directionsCannon = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // 상, 하, 좌, 우

                // 직선 경로 탐색
                directionsCannon.forEach(dir => {
                    findCannonMoves(row, col, dir[0], dir[1], isHan, moves);
                });

                // 궁성 내 대각선 경로 탐색
                if (isPalace(row, col)) {
                    const palaceDiagonalMoves = getPalaceDiagonalMoves(row, col);
                    palaceDiagonalMoves.forEach(diagDir => {
                        findCannonMoves(row, col, diagDir[0], diagDir[1], isHan, moves, true);
                    });
                }
                break;
            case 'b': // 상(B, b)
                const elephantPaths = [
                    { s: [-1, 0], d1: [-1, -1], d2: [-1, -1] }, { s: [-1, 0], d1: [-1, 1], d2: [-1, 1] },
                    { s: [1, 0], d1: [1, -1], d2: [1, -1] },   { s: [1, 0], d1: [1, 1], d2: [1, 1] },
                    { s: [0, -1], d1: [-1, -1], d2: [-1, -1] }, { s: [0, -1], d1: [1, -1], d2: [1, -1] },
                    { s: [0, 1], d1: [-1, 1], d2: [-1, 1] },   { s: [0, 1], d1: [1, 1], d2: [1, 1] },
                ];

                elephantPaths.forEach(path => {
                    const step1R = row + path.s[0];
                    const step1C = col + path.s[1];
                    if (!isPositionOnBoard(step1R, step1C) || board[step1R][step1C] !== null) return;

                    const step2R = step1R + path.d1[0];
                    const step2C = step1C + path.d1[1];
                    if (!isPositionOnBoard(step2R, step2C) || board[step2R][step2C] !== null) return;

                    const destR = step2R + path.d2[0];
                    const destC = step2C + path.d2[1];
                    if (isPositionValid(destR, destC, isHan)) {
                        moves.push([destR, destC]);
                    }
                });
                break;
            case 'r': // 차(R, r)
                const directionsRook = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // 상, 하, 좌, 우

                directionsRook.forEach(dir => {
                    let currentR = row + dir[0];
                    let currentC = col + dir[1];

                    while (isPositionOnBoard(currentR, currentC)) {
                        const targetPiece = board[currentR][currentC];
                        if (targetPiece) {
                            const isTargetHan = targetPiece.toUpperCase() === targetPiece;
                            if (isHan !== isTargetHan) {
                                moves.push([currentR, currentC]);
                            }
                            break;
                        } else {
                            moves.push([currentR, currentC]);
                        }
                        currentR += dir[0];
                        currentC += dir[1];
                    }
                });
                // 궁성 내 대각선 이동 로직 (차)
                if (isPalace(row, col)) {
                    const palaceDiagonalLines = [];
                    if (isHan) {
                        palaceDiagonalLines.push([[0, 3], [1, 4], [2, 5]]);
                        palaceDiagonalLines.push([[0, 5], [1, 4], [2, 3]]);
                    } else {
                        palaceDiagonalLines.push([[7, 3], [8, 4], [9, 5]]);
                        palaceDiagonalLines.push([[7, 5], [8, 4], [9, 3]]);
                    }

                    palaceDiagonalLines.forEach(line => {
                        const currentPosIndex = line.findIndex(pos => pos[0] === row && pos[1] === col);
                        if (currentPosIndex !== -1) {
                            // Check moves forward along the line
                            for (let i = currentPosIndex + 1; i < line.length; i++) {
                                const [targetR, targetC] = line[i];
                                let pathClear = true;
                                // Check intermediate squares
                                for (let j = currentPosIndex + 1; j < i; j++) {
                                    const [intermediateR, intermediateC] = line[j];
                                    if (board[intermediateR][intermediateC]) {
                                        pathClear = false;
                                        break;
                                    }
                                }

                                if (pathClear) {
                                    const targetPiece = board[targetR][targetC];
                                    if (targetPiece) {
                                        const isTargetHan = targetPiece.toUpperCase() === targetPiece;
                                        if (isHan !== isTargetHan) {
                                            moves.push([targetR, targetC]); // Capture
                                        }
                                        break; // Path blocked by piece (own or captured)
                                    } else {
                                        moves.push([targetR, targetC]); // Empty square
                                    }
                                } else {
                                    break; // Path blocked by intermediate piece
                                }
                            }

                            // Check moves backward along the line
                            for (let i = currentPosIndex - 1; i >= 0; i--) {
                                const [targetR, targetC] = line[i];
                                let pathClear = true;
                                // Check intermediate squares
                                for (let j = currentPosIndex - 1; j > i; j--) {
                                    const [intermediateR, intermediateC] = line[j];
                                    if (board[intermediateR][intermediateC]) {
                                        pathClear = false;
                                        break;
                                    }
                                }

                                if (pathClear) {
                                    const targetPiece = board[targetR][targetC];
                                    if (targetPiece) {
                                        const isTargetHan = targetPiece.toUpperCase() === targetPiece;
                                        if (isHan !== isTargetHan) {
                                            moves.push([targetR, targetC]); // Capture
                                        }
                                        break; // Path blocked by piece (own or captured)
                                    } else {
                                        moves.push([targetR, targetC]); // Empty square
                                    }
                                } else {
                                    break; // Path blocked by intermediate piece
                                }
                            }
                        }
                    });
                }
                break;
            case 'k': // 궁(K, k)
            case 'a': // 사(A, a)
                const royalMoves = [
                    [-1, 0], [1, 0], [0, -1], [0, 1], // 상하좌우
                    [-1, -1], [-1, 1], [1, -1], [1, 1]  // 대각선
                ];

                royalMoves.forEach(move => {
                    const destR = row + move[0];
                    const destC = col + move[1];

                    if (isPositionValid(destR, destC, isHan) && isPalace(destR, destC)) {
                        moves.push([destR, destC]);
                    }
                });
                break;
        }
        return [...new Set(moves.map(JSON.stringify))].map(JSON.parse);
    }

    /**
     * 게임을 초기화하고 장기판을 설정합니다.
     */
    function initializeGame() {
        console.log("Initializing game...");
        gameOver = false;
        board = fenToBoard(INITIAL_FEN);
        currentPlayer = 'w'; // 항상 한나라가 먼저 시작
        playerTurn = 'w'; // 사용자는 항상 한나라
        deselectPiece();
        renderBoard();
        updateStatus();
        if (isEditing) {
             // 편집 모드였다면 게임 모드로 전환
            toggleEditMode();
        }
        // 게임 초기화 시 보드 뒤집힘 상태 초기화 (한나라가 아래쪽)
        if (isBoardFlipped) {
            boardElement.classList.remove('flipped');
            isBoardFlipped = false;
        }
        updateAiSettingsUI(); // AI 설정 UI 초기화
    }

    // --- AI 설정 관련 함수 --- //
    function updateAiSettingsUI() {
        currentAiMode = document.querySelector('input[name="ai-mode"]:checked').value;
        if (currentAiMode === 'depth') {
            aiValueInput.value = 10; // 기본값
            aiValueInput.placeholder = '탐색 깊이 (예: 10)';
        } else {
            aiValueInput.value = 1000; // 기본값 (1초)
            aiValueInput.placeholder = '탐색 시간 (ms, 예: 1000)';
        }
        currentAiValue = parseInt(aiValueInput.value, 10);
    }

    // 입력 필드 값 변경 감지
    aiValueInput.addEventListener('change', () => {
        currentAiValue = parseInt(aiValueInput.value, 10);
        if (isNaN(currentAiValue) || currentAiValue < 1) {
            currentAiValue = (currentAiMode === 'depth') ? 10 : 1000; // 유효하지 않으면 기본값으로
            aiValueInput.value = currentAiValue;
        }
    });

    // --- 판 뒤집기 기능 --- //
    function flipBoard() {
        isBoardFlipped = !isBoardFlipped;
        boardElement.classList.toggle('flipped');

        // 플레이어 턴 변경 (사용자가 조작하는 진영 변경)
        playerTurn = (playerTurn === 'w') ? 'b' : 'w';
        // 현재 게임 턴도 사용자가 조작하는 진영으로 변경
        currentPlayer = playerTurn;

        updateStatus(); // 상태 업데이트
    }

    // --- 편집 모드 관련 함수 --- //
    function toggleEditMode() {
        isEditing = !isEditing;
        const topSection = document.querySelector('.top-section');

        if (isEditing) {
            statusElement.textContent = '편집 모드';
            piecePalette.classList.remove('hidden');
            editBoardButton.textContent = '게임 모드';
            topSection.classList.add('hidden'); // 상단 섹션 숨기기
            deselectPiece();
        } else {
            statusElement.textContent = '게임 모드';
            piecePalette.classList.add('hidden');
            editBoardButton.textContent = '판 편집';
            topSection.classList.remove('hidden'); // 상단 섹션 보이기
            deselectPalettePiece();

            // 편집 모드 종료 후, 게임 상태를 유지하며 보드와 UI만 업데이트
            // 보드의 뒤집힘 상태를 유지하기 위해 현재 상태를 저장
            const wasBoardFlipped = isBoardFlipped;

            renderBoard(); // 편집된 보드 상태를 화면에 반영
            updateStatus(); // 현재 턴 및 FEN 정보 업데이트

            // 보드의 뒤집힘 상태를 다시 적용
            if (wasBoardFlipped) {
                boardElement.classList.add('flipped');
            } else {
                boardElement.classList.remove('flipped');
            }
        }
        console.log(`Edit mode: ${isEditing}`);
    }

    function handleEditBoardClick(e) {
        const target = e.target;
        const square = target.closest('.square');
        if (!square) return;

        const row = parseInt(square.dataset.row, 10);
        const col = parseInt(square.dataset.col, 10);

        if (selectedPalettePiece === 'empty') {
            board[row][col] = null; // 빈 칸으로 설정
        } else {
            board[row][col] = selectedPalettePiece; // 선택된 기물 배치
        }
        renderBoard(); // 즉시 보드 렌더링
    }

    function loadFenFromInput() {
        const fen = fenElement.value;
        try {
            const tempBoard = fenToBoard(fen);
            board = tempBoard;
            const fenParts = fen.split(' ');
            currentPlayer = fenParts[1] || 'w';
            renderBoard();
            updateStatus();
            console.log("FEN loaded successfully.");
        } catch (error) {
            console.error("Invalid FEN string:", error);
            statusElement.textContent = '유효하지 않은 FEN 문자열입니다.';
        }
    }

    function copyFenToClipboard() {
        const fenToCopy = fenElement.value;
        const copyButton = document.getElementById('copy-fen-btn');

        // Modern clipboard API for secure contexts (HTTPS, localhost)
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(fenToCopy).then(() => {
                const originalText = copyButton.textContent;
                copyButton.textContent = '복사됨!';
                setTimeout(() => {
                    copyButton.textContent = originalText;
                }, 1500);
            }).catch(err => {
                console.error('Clipboard API failed: ', err);
                alert('복사에 실패했습니다.');
            });
        } else {
            // Fallback for non-secure contexts (HTTP) or older browsers
            const textArea = document.createElement("textarea");
            textArea.value = fenToCopy;
            textArea.style.position = "fixed"; // Prevent scrolling to bottom of page in MS Edge.
            textArea.style.top = "0";
            textArea.style.left = "0";
            textArea.style.opacity = "0"; // Make it invisible

            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();

            try {
                const successful = document.execCommand('copy');
                if (successful) {
                    const originalText = copyButton.textContent;
                    copyButton.textContent = '복사됨!';
                    setTimeout(() => {
                        copyButton.textContent = originalText;
                    }, 1500);
                } else {
                     alert('복사에 실패했습니다. 수동으로 복사해주세요.');
                }
            } catch (err) {
                console.error('Fallback copy failed: ', err);
                alert('복사에 실패했습니다. 수동으로 복사해주세요.');
            }

            document.body.removeChild(textArea);
        }
    }

    function createPalette() {
        piecePalette.innerHTML = '';
        ALL_PIECES.forEach(pieceChar => {
            const palettePieceDiv = document.createElement('div');
            palettePieceDiv.classList.add('palette-piece');
            palettePieceDiv.dataset.piece = pieceChar;

            if (pieceChar === 'empty') {
                palettePieceDiv.style.backgroundColor = '#ccc';
                palettePieceDiv.textContent = '빈칸';
                palettePieceDiv.style.textAlign = 'center';
                palettePieceDiv.style.lineHeight = '50px'; // 아이콘 크기에 맞춰 조정
            } else {
                const team = (pieceChar === pieceChar.toUpperCase()) ? 'han' : 'cho';
                let pieceName = getPieceName(pieceChar.toLowerCase());
                if(pieceChar.toLowerCase() === 'p'){
                    pieceName = (team === 'han') ? 'b' : 'jol';
                }
                palettePieceDiv.style.backgroundImage = `url('/static/img/${PIECE_THEME}/${team}_${pieceName}.svg')`;
            }

            palettePieceDiv.addEventListener('click', () => {
                selectPalettePiece(pieceChar);
            });
            piecePalette.appendChild(palettePieceDiv);
        });
        selectPalettePiece(selectedPalettePiece); // 초기 선택
    }

    function selectPalettePiece(pieceChar) {
        const prevSelected = piecePalette.querySelector('.selected-palette-piece');
        if (prevSelected) {
            prevSelected.classList.remove('selected-palette-piece');
        }
        selectedPalettePiece = pieceChar;
        const currentSelected = piecePalette.querySelector(`.palette-piece[data-piece='${pieceChar}']`);
        if (currentSelected) {
            currentSelected.classList.add('selected-palette-piece');
        }
        console.log(`Palette piece selected: ${selectedPalettePiece}`);
    }

    function deselectPalettePiece() {
        const prevSelected = piecePalette.querySelector('.selected-palette-piece');
        if (prevSelected) {
            prevSelected.classList.remove('selected-palette-piece');
        }
        selectedPalettePiece = 'empty'; // 기본값으로 초기화
    }

    // --- 이벤트 리스너 --- //
    startButton.addEventListener('click', () => {
        initializeGame();
        // 오디오 컨텍스트 잠금 해제를 위해 첫 사용자 상호작용 시 오디오 재생 시도
        moveSound.play().catch(e => console.log("Audio play prevented:", e));
        moveSound.pause();
        moveSound.currentTime = 0; // 재생 위치 초기화
    });
    boardElement.addEventListener('click', handleBoardClick);
    editBoardButton.addEventListener('click', toggleEditMode);
    loadFenButton.addEventListener('click', loadFenFromInput);
    copyFenButton.addEventListener('click', copyFenToClipboard);
    flipButton.addEventListener('click', flipBoard);

    // AI 설정 라디오 버튼 이벤트 리스너
    aiModeDepthRadio.addEventListener('change', updateAiSettingsUI);
    aiModeMovetimeRadio.addEventListener('change', updateAiSettingsUI);

    // --- 초기화 --- //
    createPalette(); // 팔레트 생성
    initializeGame();
});