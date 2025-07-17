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
    const generateFenButton = document.getElementById('generate-fen-btn');
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

        while (isPositionOnBoard(currentR, currentC)) {
            const targetPiece = board[currentR][currentC];

            if (!jump) {
                // 아직 '산'을 넘기 전
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

            // 대각선 이동은 한 칸만 가능
            if (isDiagonal) break;

            currentR += dr;
            currentC += dc;
        }
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
    generateFenButton.addEventListener('click', generateFenToInput);

    /**
     * 게임을 초기화하고 장기판을 설정합니다.
     */
    function initializeGame() {
        console.log("Initializing game...");
        board = fenToBoard(INITIAL_FEN);
        currentPlayer = 'w';
        playerTurn = 'w';
        deselectPiece();
        renderBoard();
        updateStatus();
        if (isEditing) toggleEditMode(); // 게임 시작 시 편집 모드 해제
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
        
        // left, top 속성은 CSS에서 처리하므로 여기서는 제거

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
        if (isEditing) {
            handleEditBoardClick(e);
            return;
        }

        if (currentPlayer !== playerTurn) {
            console.log("Not your turn.");
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
                if (isMyPieceAtClickedPos) {
                    selectPiece(row, col, pieceAtClickedPos);
                }
            }
        } else {
            if (isMyPieceAtClickedPos) {
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
        const pieceToMove = board[fromRow][fromCol];
        board[toRow][toCol] = pieceToMove;
        board[fromRow][fromCol] = null;

        deselectPiece();
        renderBoard();

        currentPlayer = 'b';
        updateStatus();
        
        await getAiMove();
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
                body: JSON.stringify({ fen: currentFen }),
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

        moveSound.play(); // AI 기물 이동 효과음 재생

        renderBoard();
        currentPlayer = 'w';
        updateStatus();
    }

    /**
     * 게임 상태 정보를 업데이트합니다.
     */
    function updateStatus() {
        turnElement.textContent = (currentPlayer === 'w') ? '한나라 (당신)' : '초나라 (AI)';
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

        switch (pieceType) {
            case 'p': // 병(P) / 졸(p)
                const isHanPawn = piece === 'P';
                const forwardPawn = isHanPawn ? -1 : 1;

                // 1. 한 칸 전진
                const forwardPosPawn = [row + forwardPawn, col];
                if (isPositionValid(forwardPosPawn[0], forwardPosPawn[1], isHanPawn)) {
                    moves.push(forwardPosPawn);
                }

                // 2. 좌우 이동
                const leftPosPawn = [row, col - 1];
                if (isPositionValid(leftPosPawn[0], leftPosPawn[1], isHanPawn)) {
                    moves.push(leftPosPawn);
                }
                const rightPosPawn = [row, col + 1];
                if (isPositionValid(rightPosPawn[0], rightPosPawn[1], isHanPawn)) {
                    moves.push(rightPosPawn);
                }

                // 3. 궁성 내 대각선 이동
                const inOpponentPalacePawn = isHanPawn ? (row <= 2 && col >= 3 && col <= 5) : (row >= 7 && col >= 3 && col <= 5);
                if (inOpponentPalacePawn) {
                    // 궁성 중앙에서 귀로
                    if (col === 4 && (row === 1 || row === 8)) {
                        [[row - 1, col - 1], [row - 1, col + 1], [row + 1, col - 1], [row + 1, col + 1]].forEach(m => {
                             if (isPositionValid(m[0], m[1], isHanPawn) && isPalaceCorner(m[0], m[1])) moves.push(m);
                        });
                    }
                    // 궁성 귀에서 중앙으로
                    if (isPalaceCorner(row, col)) {
                        const centerPosPawn = [isHanPawn ? 1 : 8, 4];
                        if (isPositionValid(centerPosPawn[0], centerPosPawn[1], isHanPawn)) {
                            moves.push(centerPosPawn);
                        }
                    }
                }
                break;
            case 'n': // 마(N, n)
                const isHanKnight = piece === 'N';
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
                        console.log(`Ma: Path through (${stepRow}, ${stepCol}) is clear.`);
                        move.final_dest_offsets.forEach(d => {
                            const destRow = row + d[0]; // 초기 위치에서 최종 목적지까지의 절대 오프셋
                            const destCol = col + d[1]; // 초기 위치에서 최종 목적지까지의 절대 오프셋
                            // 목적지가 유효한지 (보드 안이고, 아군 기물이 없는지) 확인
                            if (isPositionValid(destRow, destCol, isHanKnight)) {
                                moves.push([destRow, destCol]);
                            }
                        });
                    } else if (isPositionOnBoard(stepRow, stepCol)) {
                        console.log(`Ma: Path through (${stepRow}, ${stepCol}) is blocked by ${board[stepRow][stepCol]}.`);
                    }
                });
                break;
            case 'c': // 포(C, c)
                const isHanCannon = piece === 'C';
                const directionsCannon = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // 상, 하, 좌, 우

                // 직선 경로 탐색
                directionsCannon.forEach(dir => {
                    findCannonMoves(row, col, dir[0], dir[1], isHanCannon, moves);
                });

                // 궁성 내 대각선 경로 탐색
                if (isPalace(row, col)) {
                    const palaceDiagonalMoves = getPalaceDiagonalMoves(row, col);
                    palaceDiagonalMoves.forEach(diagDir => {
                        findCannonMoves(row, col, diagDir[0], diagDir[1], isHanCannon, moves, true);
                    });
                }
                break;
            case 'b': // 상(B, b)
                console.log(`Evaluating Sang at (${row}, ${col})`);
                const isHanElephant = piece === 'B';
                const elephantPaths = [
                    // 각 경로는 (시작점) -> (첫 번째 멱) -> (두 번째 멱) -> (최종 목적지) 로 구성됩니다.
                    // s: 첫 번째 멱 (상하좌우 한 칸)
                    // d1: 두 번째 멱 (첫 번째 멱에서 대각선 한 칸)
                    // d2: 최종 목적지 (두 번째 멱에서 대각선 한 칸)

                    // 위로 -> 위-왼쪽 -> 위-왼쪽
                    { s: [-1, 0], d1: [-1, -1], d2: [-1, -1] },
                    // 위로 -> 위-오른쪽 -> 위-오른쪽
                    { s: [-1, 0], d1: [-1, 1], d2: [-1, 1] },

                    // 아래로 -> 아래-왼쪽 -> 아래-왼쪽
                    { s: [1, 0], d1: [1, -1], d2: [1, -1] },
                    // 아래로 -> 아래-오른쪽 -> 아래-오른쪽
                    { s: [1, 0], d1: [1, 1], d2: [1, 1] },

                    // 왼쪽으로 -> 위-왼쪽 -> 위-왼쪽
                    { s: [0, -1], d1: [-1, -1], d2: [-1, -1] },
                    // 왼쪽으로 -> 아래-왼쪽 -> 아래-왼쪽
                    { s: [0, -1], d1: [1, -1], d2: [1, -1] },

                    // 오른쪽으로 -> 위-오른쪽 -> 위-오른쪽
                    { s: [0, 1], d1: [-1, 1], d2: [-1, 1] },
                    // 오른쪽으로 -> 아래-오른쪽 -> 아래-오른쪽
                    { s: [0, 1], d1: [1, 1], d2: [1, 1] },
                ];

                elephantPaths.forEach(path => {
                    // 첫 번째 경유지 (상하좌우 한 칸)
                    const step1R = row + path.s[0];
                    const step1C = col + path.s[1];

                    if (!isPositionOnBoard(step1R, step1C) || board[step1R][step1C] !== null) {
                        console.log(`Sang: First step (${step1R}, ${step1C}) blocked or off board.`);
                        return; // 첫 번째 멱이 막혔거나 보드 밖
                    }

                    // 두 번째 경유지 (첫 번째 멱에서 대각선 한 칸)
                    const step2R = step1R + path.d1[0];
                    const step2C = step1C + path.d1[1];

                    if (!isPositionOnBoard(step2R, step2C) || board[step2R][step2C] !== null) {
                        console.log(`Sang: Second step (${step2R}, ${step2C}) blocked or off board.`);
                        return; // 두 번째 멱이 막혔거나 보드 밖
                    }

                    // 최종 목적지 (두 번째 멱에서 대각선 한 칸)
                    const destR = step2R + path.d2[0];
                    const destC = step2C + path.d2[1];

                    if (isPositionValid(destR, destC, isHanElephant)) {
                        moves.push([destR, destC]);
                    }
                });
                break;
            case 'r': // 차(R, r)
                const isHanRook = piece === 'R';
                const directionsRook = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // 상, 하, 좌, 우

                directionsRook.forEach(dir => {
                    let currentR = row + dir[0];
                    let currentC = col + dir[1];

                    while (isPositionOnBoard(currentR, currentC)) {
                        const targetPiece = board[currentR][currentC];

                        if (targetPiece) {
                            const isTargetHan = targetPiece.toUpperCase() === targetPiece;
                            if (isHanRook !== isTargetHan) {
                                // 상대방 기물: 잡고 이동 종료
                                moves.push([currentR, currentC]);
                            }
                            break; // 아군 기물이거나 잡았으면 해당 방향 탐색 종료
                        } else {
                            // 빈 칸: 이동 가능
                            moves.push([currentR, currentC]);
                        }
                        currentR += dir[0];
                        currentC += dir[1];
                    }
                });
                break;
            case 'k': // 궁(K, k)
            case 'a': // 사(A, a)
                const isHanRoyal = (piece === 'K' || piece === 'A');
                const royalMoves = [
                    [-1, 0], [1, 0], [0, -1], [0, 1], // 상하좌우
                    [-1, -1], [-1, 1], [1, -1], [1, 1]  // 대각선
                ];

                royalMoves.forEach(move => {
                    const destR = row + move[0];
                    const destC = col + move[1];

                    // 목적지가 보드 안에 있고, 아군 기물이 없으며, 궁성 안에 있는지 확인
                    if (isPositionValid(destR, destC, isHanRoyal) && isPalace(destR, destC)) {
                        moves.push([destR, destC]);
                    }
                });
                break;
        }
        return [...new Set(moves.map(JSON.stringify))].map(JSON.parse);
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
    generateFenButton.addEventListener('click', generateFenToInput);

    /**
     * 게임을 초기화하고 장기판을 설정합니다.
     */
    function initializeGame() {
        console.log("Initializing game...");
        board = fenToBoard(INITIAL_FEN);
        currentPlayer = 'w';
        playerTurn = 'w';
        deselectPiece();
        renderBoard();
        updateStatus();
        if (isEditing) toggleEditMode(); // 게임 시작 시 편집 모드 해제
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
        
        // left, top 속성은 CSS에서 처리하므로 여기서는 제거

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
        if (isEditing) {
            handleEditBoardClick(e);
            return;
        }

        if (currentPlayer !== playerTurn) {
            console.log("Not your turn.");
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
                if (isMyPieceAtClickedPos) {
                    selectPiece(row, col, pieceAtClickedPos);
                }
            }
        } else {
            if (isMyPieceAtClickedPos) {
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
        const pieceToMove = board[fromRow][fromCol];
        board[toRow][toCol] = pieceToMove;
        board[fromRow][fromCol] = null;

        deselectPiece();
        renderBoard();

        currentPlayer = 'b';
        updateStatus();
        
        await getAiMove();
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
                body: JSON.stringify({ fen: currentFen }),
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

        moveSound.play(); // AI 기물 이동 효과음 재생

        renderBoard();
        currentPlayer = 'w';
        updateStatus();
    }

    /**
     * 게임 상태 정보를 업데이트합니다.
     */
    function updateStatus() {
        turnElement.textContent = (currentPlayer === 'w') ? '한나라 (당신)' : '초나라 (AI)';
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

        switch (pieceType) {
            case 'p': // 병(P) / 졸(p)
                const isHanPawn = piece === 'P';
                const forwardPawn = isHanPawn ? -1 : 1;

                // 1. 한 칸 전진
                const forwardPosPawn = [row + forwardPawn, col];
                if (isPositionValid(forwardPosPawn[0], forwardPosPawn[1], isHanPawn)) {
                    moves.push(forwardPosPawn);
                }

                // 2. 좌우 이동
                const leftPosPawn = [row, col - 1];
                if (isPositionValid(leftPosPawn[0], leftPosPawn[1], isHanPawn)) {
                    moves.push(leftPosPawn);
                }
                const rightPosPawn = [row, col + 1];
                if (isPositionValid(rightPosPawn[0], rightPosPawn[1], isHanPawn)) {
                    moves.push(rightPosPawn);
                }

                // 3. 궁성 내 대각선 이동
                const inOpponentPalacePawn = isHanPawn ? (row <= 2 && col >= 3 && col <= 5) : (row >= 7 && col >= 3 && col <= 5);
                if (inOpponentPalacePawn) {
                    // 궁성 중앙에서 귀로
                    if (col === 4 && (row === 1 || row === 8)) {
                        [[row - 1, col - 1], [row - 1, col + 1], [row + 1, col - 1], [row + 1, col + 1]].forEach(m => {
                             if (isPositionValid(m[0], m[1], isHanPawn) && isPalaceCorner(m[0], m[1])) moves.push(m);
                        });
                    }
                    // 궁성 귀에서 중앙으로
                    if (isPalaceCorner(row, col)) {
                        const centerPosPawn = [isHanPawn ? 1 : 8, 4];
                        if (isPositionValid(centerPosPawn[0], centerPosPawn[1], isHanPawn)) {
                            moves.push(centerPosPawn);
                        }
                    }
                }
                break;
            case 'n': // 마(N, n)
                const isHanKnight = piece === 'N';
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
                        console.log(`Ma: Path through (${stepRow}, ${stepCol}) is clear.`);
                        move.final_dest_offsets.forEach(d => {
                            const destRow = row + d[0]; // 초기 위치에서 최종 목적지까지의 절대 오프셋
                            const destCol = col + d[1]; // 초기 위치에서 최종 목적지까지의 절대 오프셋
                            // 목적지가 유효한지 (보드 안이고, 아군 기물이 없는지) 확인
                            if (isPositionValid(destRow, destCol, isHanKnight)) {
                                moves.push([destRow, destCol]);
                            }
                        });
                    } else if (isPositionOnBoard(stepRow, stepCol)) {
                        console.log(`Ma: Path through (${stepRow}, ${stepCol}) is blocked by ${board[stepRow][stepCol]}.`);
                    }
                });
                break;
            case 'c': // 포(C, c)
                const isHanCannon = piece === 'C';
                const directionsCannon = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // 상, 하, 좌, 우

                // 직선 경로 탐색
                directionsCannon.forEach(dir => {
                    findCannonMoves(row, col, dir[0], dir[1], isHanCannon, moves);
                });

                // 궁성 내 대각선 경로 탐색
                if (isPalace(row, col)) {
                    const palaceDiagonalMoves = getPalaceDiagonalMoves(row, col);
                    palaceDiagonalMoves.forEach(diagDir => {
                        findCannonMoves(row, col, diagDir[0], diagDir[1], isHanCannon, moves, true);
                    });
                }
                break;
            case 'b': // 상(B, b)
                console.log(`Evaluating Sang at (${row}, ${col})`);
                const isHanElephant = piece === 'B';
                const elephantPaths = [
                    // 각 경로는 (시작점) -> (첫 번째 멱) -> (두 번째 멱) -> (최종 목적지) 로 구성됩니다.
                    // s: 첫 번째 멱 (상하좌우 한 칸)
                    // d1: 두 번째 멱 (첫 번째 멱에서 대각선 한 칸)
                    // d2: 최종 목적지 (두 번째 멱에서 대각선 한 칸)

                    // 위로 -> 위-왼쪽 -> 위-왼쪽
                    { s: [-1, 0], d1: [-1, -1], d2: [-1, -1] },
                    // 위로 -> 위-오른쪽 -> 위-오른쪽
                    { s: [-1, 0], d1: [-1, 1], d2: [-1, 1] },

                    // 아래로 -> 아래-왼쪽 -> 아래-왼쪽
                    { s: [1, 0], d1: [1, -1], d2: [1, -1] },
                    // 아래로 -> 아래-오른쪽 -> 아래-오른쪽
                    { s: [1, 0], d1: [1, 1], d2: [1, 1] },

                    // 왼쪽으로 -> 위-왼쪽 -> 위-왼쪽
                    { s: [0, -1], d1: [-1, -1], d2: [-1, -1] },
                    // 왼쪽으로 -> 아래-왼쪽 -> 아래-왼쪽
                    { s: [0, -1], d1: [1, -1], d2: [1, -1] },

                    // 오른쪽으로 -> 위-오른쪽 -> 위-오른쪽
                    { s: [0, 1], d1: [-1, 1], d2: [-1, 1] },
                    // 오른쪽으로 -> 아래-오른쪽 -> 아래-오른쪽
                    { s: [0, 1], d1: [1, 1], d2: [1, 1] },
                ];

                elephantPaths.forEach(path => {
                    // 첫 번째 경유지 (상하좌우 한 칸)
                    const step1R = row + path.s[0];
                    const step1C = col + path.s[1];

                    if (!isPositionOnBoard(step1R, step1C) || board[step1R][step1C] !== null) {
                        console.log(`Sang: First step (${step1R}, ${step1C}) blocked or off board.`);
                        return; // 첫 번째 멱이 막혔거나 보드 밖
                    }

                    // 두 번째 경유지 (첫 번째 멱에서 대각선 한 칸)
                    const step2R = step1R + path.d1[0];
                    const step2C = step1C + path.d1[1];

                    if (!isPositionOnBoard(step2R, step2C) || board[step2R][step2C] !== null) {
                        console.log(`Sang: Second step (${step2R}, ${step2C}) blocked or off board.`);
                        return; // 두 번째 멱이 막혔거나 보드 밖
                    }

                    // 최종 목적지 (두 번째 멱에서 대각선 한 칸)
                    const destR = step2R + path.d2[0];
                    const destC = step2C + path.d2[1];

                    if (isPositionValid(destR, destC, isHanElephant)) {
                        moves.push([destR, destC]);
                    }
                });
                break;
            case 'r': // 차(R, r)
                const isHanRook = piece === 'R';
                const directionsRook = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // 상, 하, 좌, 우

                directionsRook.forEach(dir => {
                    let currentR = row + dir[0];
                    let currentC = col + dir[1];

                    while (isPositionOnBoard(currentR, currentC)) {
                        const targetPiece = board[currentR][currentC];

                        if (targetPiece) {
                            const isTargetHan = targetPiece.toUpperCase() === targetPiece;
                            if (isHanRook !== isTargetHan) {
                                // 상대방 기물: 잡고 이동 종료
                                moves.push([currentR, currentC]);
                            }
                            break; // 아군 기물이거나 잡았으면 해당 방향 탐색 종료
                        } else {
                            // 빈 칸: 이동 가능
                            moves.push([currentR, currentC]);
                        }
                        currentR += dir[0];
                        currentC += dir[1];
                    }
                });
                break;
            case 'k': // 궁(K, k)
            case 'a': // 사(A, a)
                const isHanRoyal = (piece === 'K' || piece === 'A');
                const royalMoves = [
                    [-1, 0], [1, 0], [0, -1], [0, 1], // 상하좌우
                    [-1, -1], [-1, 1], [1, -1], [1, 1]  // 대각선
                ];

                royalMoves.forEach(move => {
                    const destR = row + move[0];
                    const destC = col + move[1];

                    // 목적지가 보드 안에 있고, 아군 기물이 없으며, 궁성 안에 있는지 확인
                    if (isPositionValid(destR, destC, isHanRoyal) && isPalace(destR, destC)) {
                        moves.push([destR, destC]);
                    }
                });
                break;
        }
        return [...new Set(moves.map(JSON.stringify))].map(JSON.parse);
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
    generateFenButton.addEventListener('click', generateFenToInput);

    /**
     * 게임을 초기화하고 장기판을 설정합니다.
     */
    function initializeGame() {
        console.log("Initializing game...");
        board = fenToBoard(INITIAL_FEN);
        currentPlayer = 'w';
        playerTurn = 'w';
        deselectPiece();
        renderBoard();
        updateStatus();
        if (isEditing) toggleEditMode(); // 게임 시작 시 편집 모드 해제
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
        
        // left, top 속성은 CSS에서 처리하므로 여기서는 제거

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
        if (isEditing) {
            handleEditBoardClick(e);
            return;
        }

        if (currentPlayer !== playerTurn) {
            console.log("Not your turn.");
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
                if (isMyPieceAtClickedPos) {
                    selectPiece(row, col, pieceAtClickedPos);
                }
            }
        } else {
            if (isMyPieceAtClickedPos) {
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
        const pieceToMove = board[fromRow][fromCol];
        board[toRow][toCol] = pieceToMove;
        board[fromRow][fromCol] = null;

        deselectPiece();
        renderBoard();

        currentPlayer = 'b';
        updateStatus();
        
        await getAiMove();
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
                body: JSON.stringify({ fen: currentFen }),
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

        moveSound.play(); // AI 기물 이동 효과음 재생

        renderBoard();
        currentPlayer = 'w';
        updateStatus();
    }

    /**
     * 게임 상태 정보를 업데이트합니다.
     */
    function updateStatus() {
        turnElement.textContent = (currentPlayer === 'w') ? '한나라 (당신)' : '초나라 (AI)';
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

        switch (pieceType) {
            case 'p': // 병(P) / 졸(p)
                const isHanPawn = piece === 'P';
                const forwardPawn = isHanPawn ? -1 : 1;

                // 1. 한 칸 전진
                const forwardPosPawn = [row + forwardPawn, col];
                if (isPositionValid(forwardPosPawn[0], forwardPosPawn[1], isHanPawn)) {
                    moves.push(forwardPosPawn);
                }

                // 2. 좌우 이동
                const leftPosPawn = [row, col - 1];
                if (isPositionValid(leftPosPawn[0], leftPosPawn[1], isHanPawn)) {
                    moves.push(leftPosPawn);
                }
                const rightPosPawn = [row, col + 1];
                if (isPositionValid(rightPosPawn[0], rightPosPawn[1], isHanPawn)) {
                    moves.push(rightPosPawn);
                }

                // 3. 궁성 내 대각선 이동
                const inOpponentPalacePawn = isHanPawn ? (row <= 2 && col >= 3 && col <= 5) : (row >= 7 && col >= 3 && col <= 5);
                if (inOpponentPalacePawn) {
                    // 궁성 중앙에서 귀로
                    if (col === 4 && (row === 1 || row === 8)) {
                        [[row - 1, col - 1], [row - 1, col + 1], [row + 1, col - 1], [row + 1, col + 1]].forEach(m => {
                             if (isPositionValid(m[0], m[1], isHanPawn) && isPalaceCorner(m[0], m[1])) moves.push(m);
                        });
                    }
                    // 궁성 귀에서 중앙으로
                    if (isPalaceCorner(row, col)) {
                        const centerPosPawn = [isHanPawn ? 1 : 8, 4];
                        if (isPositionValid(centerPosPawn[0], centerPosPawn[1], isHanPawn)) {
                            moves.push(centerPosPawn);
                        }
                    }
                }
                break;
            case 'n': // 마(N, n)
                const isHanKnight = piece === 'N';
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
                        console.log(`Ma: Path through (${stepRow}, ${stepCol}) is clear.`);
                        move.final_dest_offsets.forEach(d => {
                            const destRow = row + d[0]; // 초기 위치에서 최종 목적지까지의 절대 오프셋
                            const destCol = col + d[1]; // 초기 위치에서 최종 목적지까지의 절대 오프셋
                            // 목적지가 유효한지 (보드 안이고, 아군 기물이 없는지) 확인
                            if (isPositionValid(destRow, destCol, isHanKnight)) {
                                moves.push([destRow, destCol]);
                            }
                        });
                    } else if (isPositionOnBoard(stepRow, stepCol)) {
                        console.log(`Ma: Path through (${stepRow}, ${stepCol}) is blocked by ${board[stepRow][stepCol]}.`);
                    }
                });
                break;
            case 'c': // 포(C, c)
                const isHanCannon = piece === 'C';
                const directionsCannon = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // 상, 하, 좌, 우

                // 직선 경로 탐색
                directionsCannon.forEach(dir => {
                    findCannonMoves(row, col, dir[0], dir[1], isHanCannon, moves);
                });

                // 궁성 내 대각선 경로 탐색
                if (isPalace(row, col)) {
                    const palaceDiagonalMoves = getPalaceDiagonalMoves(row, col);
                    palaceDiagonalMoves.forEach(diagDir => {
                        findCannonMoves(row, col, diagDir[0], diagDir[1], isHanCannon, moves, true);
                    });
                }
                break;
            case 'b': // 상(B, b)
                console.log(`Evaluating Sang at (${row}, ${col})`);
                const isHanElephant = piece === 'B';
                const elephantPaths = [
                    // 각 경로는 (시작점) -> (첫 번째 멱) -> (두 번째 멱) -> (최종 목적지) 로 구성됩니다.
                    // s: 첫 번째 멱 (상하좌우 한 칸)
                    // d1: 두 번째 멱 (첫 번째 멱에서 대각선 한 칸)
                    // d2: 최종 목적지 (두 번째 멱에서 대각선 한 칸)

                    // 위로 -> 위-왼쪽 -> 위-왼쪽
                    { s: [-1, 0], d1: [-1, -1], d2: [-1, -1] },
                    // 위로 -> 위-오른쪽 -> 위-오른쪽
                    { s: [-1, 0], d1: [-1, 1], d2: [-1, 1] },

                    // 아래로 -> 아래-왼쪽 -> 아래-왼쪽
                    { s: [1, 0], d1: [1, -1], d2: [1, -1] },
                    // 아래로 -> 아래-오른쪽 -> 아래-오른쪽
                    { s: [1, 0], d1: [1, 1], d2: [1, 1] },

                    // 왼쪽으로 -> 위-왼쪽 -> 위-왼쪽
                    { s: [0, -1], d1: [-1, -1], d2: [-1, -1] },
                    // 왼쪽으로 -> 아래-왼쪽 -> 아래-왼쪽
                    { s: [0, -1], d1: [1, -1], d2: [1, -1] },

                    // 오른쪽으로 -> 위-오른쪽 -> 위-오른쪽
                    { s: [0, 1], d1: [-1, 1], d2: [-1, 1] },
                    // 오른쪽으로 -> 아래-오른쪽 -> 아래-오른쪽
                    { s: [0, 1], d1: [1, 1], d2: [1, 1] },
                ];

                elephantPaths.forEach(path => {
                    // 첫 번째 경유지 (상하좌우 한 칸)
                    const step1R = row + path.s[0];
                    const step1C = col + path.s[1];

                    if (!isPositionOnBoard(step1R, step1C) || board[step1R][step1C] !== null) {
                        console.log(`Sang: First step (${step1R}, ${step1C}) blocked or off board.`);
                        return; // 첫 번째 멱이 막혔거나 보드 밖
                    }

                    // 두 번째 경유지 (첫 번째 멱에서 대각선 한 칸)
                    const step2R = step1R + path.d1[0];
                    const step2C = step1C + path.d1[1];

                    if (!isPositionOnBoard(step2R, step2C) || board[step2R][step2C] !== null) {
                        console.log(`Sang: Second step (${step2R}, ${step2C}) blocked or off board.`);
                        return; // 두 번째 멱이 막혔거나 보드 밖
                    }

                    // 최종 목적지 (두 번째 멱에서 대각선 한 칸)
                    const destR = step2R + path.d2[0];
                    const destC = step2C + path.d2[1];

                    if (isPositionValid(destR, destC, isHanElephant)) {
                        moves.push([destR, destC]);
                    }
                });
                break;
            case 'r': // 차(R, r)
                const isHanRook = piece === 'R';
                const directionsRook = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // 상, 하, 좌, 우

                directionsRook.forEach(dir => {
                    let currentR = row + dir[0];
                    let currentC = col + dir[1];

                    while (isPositionOnBoard(currentR, currentC)) {
                        const targetPiece = board[currentR][currentC];

                        if (targetPiece) {
                            const isTargetHan = targetPiece.toUpperCase() === targetPiece;
                            if (isHanRook !== isTargetHan) {
                                // 상대방 기물: 잡고 이동 종료
                                moves.push([currentR, currentC]);
                            }
                            break; // 아군 기물이거나 잡았으면 해당 방향 탐색 종료
                        } else {
                            // 빈 칸: 이동 가능
                            moves.push([currentR, currentC]);
                        }
                        currentR += dir[0];
                        currentC += dir[1];
                    }
                });
                break;
            case 'k': // 궁(K, k)
            case 'a': // 사(A, a)
                const isHanRoyal = (piece === 'K' || piece === 'A');
                const royalMoves = [
                    [-1, 0], [1, 0], [0, -1], [0, 1], // 상하좌우
                    [-1, -1], [-1, 1], [1, -1], [1, 1]  // 대각선
                ];

                royalMoves.forEach(move => {
                    const destR = row + move[0];
                    const destC = col + move[1];

                    // 목적지가 보드 안에 있고, 아군 기물이 없으며, 궁성 안에 있는지 확인
                    if (isPositionValid(destR, destC, isHanRoyal) && isPalace(destR, destC)) {
                        moves.push([destR, destC]);
                    }
                });
                break;
        }
        return [...new Set(moves.map(JSON.stringify))].map(JSON.parse);
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
    generateFenButton.addEventListener('click', generateFenToInput);

    // --- 편집 모드 관련 함수 --- //
    function toggleEditMode() {
        isEditing = !isEditing;
        if (isEditing) {
            statusElement.textContent = '편집 모드';
            piecePalette.classList.remove('hidden');
            editBoardButton.textContent = '게임 모드';
            // 게임 모드에서 선택된 기물 해제
            deselectPiece();
            // 보드 초기화 (선택적으로)
            // board = Array(10).fill(null).map(() => Array(9).fill(null));
            // renderBoard();
        } else {
            statusElement.textContent = '게임 모드';
            piecePalette.classList.add('hidden');
            editBoardButton.textContent = '판 편집';
            // 편집 모드에서 선택된 팔레트 기물 해제
            deselectPalettePiece();
            // 게임 모드로 전환 시 현재 보드 상태로 게임 초기화
            initializeGame();
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
        renderBoard();
    }

    function loadFenFromInput() {
        const fen = fenElement.value;
        try {
            board = fenToBoard(fen);
            renderBoard();
            updateStatus();
            console.log("FEN loaded successfully.");
        } catch (error) {
            console.error("Invalid FEN string:", error);
            statusElement.textContent = '유효하지 않은 FEN 문자열입니다.';
        }
    }

    function generateFenToInput() {
        fenElement.value = boardToFen();
        console.log("FEN generated.");
    }

    function createPalette() {
        piecePalette.innerHTML = '';
        ALL_PIECES.forEach(pieceChar => {
            const palettePieceDiv = document.createElement('div');
            palettePieceDiv.classList.add('palette-piece');
            palettePieceDiv.dataset.piece = pieceChar;

            if (pieceChar === 'empty') {
                palettePieceDiv.style.backgroundColor = 'lightgray'; // 빈 칸 표시
                palettePieceDiv.textContent = 'Empty';
            } else {
                const team = (pieceChar === pieceChar.toUpperCase()) ? 'han' : 'cho';
                let pieceName;
                if (pieceChar.toLowerCase() === 'p') {
                    pieceName = (team === 'han') ? 'b' : 'jol';
                } else {
                    pieceName = getPieceName(pieceChar.toLowerCase());
                }
                palettePieceDiv.style.backgroundImage = `url('/static/img/${PIECE_THEME}/${team}_${pieceName}.svg')`;
            }

            palettePieceDiv.addEventListener('click', () => {
                selectPalettePiece(pieceChar);
            });
            piecePalette.appendChild(palettePieceDiv);
        });
        // 초기 선택
        selectPalettePiece(selectedPalettePiece);
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

    /**
     * 게임을 초기화하고 장기판을 설정합니다.
     */
    // 기존 initializeGame 함수는 그대로 유지

    // --- 초기화 --- //
    createPalette(); // 팔레트 생성
    initializeGame();
});