from flask import Flask, render_template, request, jsonify
import subprocess
import os

app = Flask(__name__)

# Stockfish 엔진 경로 설정
STOCKFISH_PATH = os.path.join(os.path.dirname(__file__), 'stockfish.exe')

@app.route('/')
def index():
    """메인 장기 게임 페이지를 렌더링합니다."""
    return render_template('index.html')

@app.route('/docs')
def docs():
    """프로젝트 설명서 페이지를 렌더링합니다."""
    return render_template('documentation.html')

def _get_stockfish_move(fen, ai_mode, ai_value):
    try:
        process = subprocess.Popen(
            [STOCKFISH_PATH],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            universal_newlines=True,
            creationflags=subprocess.CREATE_NO_WINDOW
        )

        def send_command(cmd):
            app.logger.debug(f"Sending to Stockfish: {cmd}")
            process.stdin.write(cmd + '\n')
            process.stdin.flush()

        # 1. UCI 모드 시작 및 확인
        send_command('uci')
        while True:
            line = process.stdout.readline().strip()
            if line == 'uciok':
                break
        
        # 2. 장기 모드 설정
        send_command('setoption name UCI_Variant value janggimodern')

        # 3. 엔진 준비 확인
        send_command('isready')
        while True:
            line = process.stdout.readline().strip()
            if line == 'readyok':
                break

        # 4. 현재 판 상태 전달
        send_command(f'position fen {fen}')

        # 5. 수 계산 명령
        go_command = f'go {ai_mode} {ai_value}'
        send_command(go_command)

        # 6. bestmove 결과 수신
        best_move = None
        score_info = None # AI 평가 정보를 저장할 변수

        while True:
            line = process.stdout.readline().strip()
            app.logger.debug(f"Stockfish output: {line}") # 디버깅을 위해 엔진 출력 로깅

            if line.startswith('info'):
                # 'score cp' (센티폰 점수) 파싱
                if 'score cp' in line:
                    try:
                        parts = line.split()
                        # 'cp'의 인덱스를 찾고, 그 다음 요소가 점수 값
                        cp_idx = parts.index('cp')
                        score_value_str = parts[cp_idx + 1]
                        score_value = int(score_value_str)
                        score_info = f"점수: {score_value / 100:.2f}"
                    except (ValueError, IndexError) as e:
                        app.logger.warning(f"Could not parse score cp from line: {line}. Error: {e}")
                # 'score mate' (체크메이트까지 남은 수) 파싱
                elif 'score mate' in line:
                    try:
                        parts = line.split()
                        # 'mate'의 인덱스를 찾고, 그 다음 요소가 메이트 값
                        mate_idx = parts.index('mate')
                        mate_value_str = parts[mate_idx + 1]
                        mate_value = int(mate_value_str)
                        score_info = f"메이트: {mate_value}수"
                    except (ValueError, IndexError) as e:
                        app.logger.warning(f"Could not parse score mate from line: {line}. Error: {e}")

            if line.startswith('bestmove'):
                best_move = line.split(' ')[1]
                break
        
        # 7. 프로세스 종료
        send_command('quit')
        process.wait()

        if best_move:
            return {'bestmove': best_move, 'score': score_info}
        else:
            return {'error': 'Could not determine best move'}

    except FileNotFoundError:
        app.logger.error(f"Stockfish executable not found at {STOCKFISH_PATH}")
        return {'error': f'Engine not found at {STOCKFISH_PATH}'}
    except Exception as e:
        app.logger.error(f"An unexpected error occurred: {e}")
        return {'error': str(e)}

@app.route('/get_ai_move', methods=['POST'])
def get_ai_move():
    """
    프론트엔드로부터 FEN을 받아 Stockfish 엔진과 상호작용하여
    계산된 최적의 수를 UCI 형태로 반환합니다. (대화형 방식)
    """
    fen = request.json.get('fen')
    ai_mode = request.json.get('ai_mode', 'depth') # 기본값은 depth
    ai_value = request.json.get('ai_value', 10) # 기본값은 10

    if not fen:
        return jsonify({'error': 'FEN is missing'}), 400

    result = _get_stockfish_move(fen, ai_mode, ai_value)

    if 'error' in result:
        return jsonify(result), 500
    else:
        return jsonify(result)

@app.route('/api/play_move', methods=['POST'])
def api_play_move():
    """
    외부 API 호출을 통해 FEN과 AI 설정을 받아 AI의 다음 수를 반환합니다.
    """
    data = request.get_json()
    fen = data.get('fen')
    ai_mode = data.get('ai_mode', 'depth')
    ai_value = data.get('ai_value', 10)

    if not fen:
        return jsonify({'error': 'FEN is missing'}), 400

    result = _get_stockfish_move(fen, ai_mode, ai_value)

    if 'error' in result:
        return jsonify(result), 500
    else:
        return jsonify(result)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')
