from flask import Flask, render_template, request, jsonify
import subprocess
import os
import threading
import atexit

app = Flask(__name__)

# Stockfish 엔진 경로 설정
STOCKFISH_PATH = os.path.join(os.path.dirname(__file__), 'stockfish')

class JanggiEngine:
    def __init__(self):
        self.process = None
        self.lock = threading.Lock()
    
    def _start(self):
        """엔진 프로세스가 실행 중인지 확인하고, 없으면 시작합니다."""
        if self.process and self.process.poll() is None:
            return
        
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=1)
            except:
                pass

        popen_kwargs = {
            "stdin": subprocess.PIPE,
            "stdout": subprocess.PIPE,
            "stderr": subprocess.PIPE,
            "text": True,
            "universal_newlines": True,
            "bufsize": 1,
            "errors": 'ignore'
        }
        # Windows 환경에서 창 띄우지 않기 위한 설정
        if os.name == 'nt':
            # subprocess.CREATE_NO_WINDOW = 0x08000000
            popen_kwargs['creationflags'] = 0x08000000

        try:
            self.process = subprocess.Popen([STOCKFISH_PATH], **popen_kwargs)
            
            self._send("uci")
            while True:
                line = self.process.stdout.readline().strip()
                if line == "uciok": break
            
            # 엔진 옵션 설정 (자원 제한 및 장기 모드)
            self._send("setoption name UCI_Variant value janggimodern")
            self._send("setoption name Threads value 1") # CPU 사용량 제한 (1개 스레드)
            self._send("setoption name Hash value 16")    # 메모리 사용량 제한 (16MB)
            
            self._send("isready")
            while True:
                line = self.process.stdout.readline().strip()
                if line == "readyok": break
        except Exception as e:
            app.logger.error(f"Failed to start Stockfish: {e}")
            self.process = None

    def _send(self, cmd):
        if self.process and self.process.stdin:
            self.process.stdin.write(cmd + "\n")
            self.process.stdin.flush()

    def get_move(self, fen, ai_mode='depth', ai_value=10):
        """최적의 수를 계산합니다."""
        with self.lock:
            try:
                self._start()
                if not self.process:
                    return {'error': 'Engine not running'}

                self._send(f"position fen {fen}")
                self._send(f"go {ai_mode} {ai_value}")
                
                best_move = None
                score_info = None
                
                while True:
                    line = self.process.stdout.readline().strip()
                    if not line: break
                    
                    if line.startswith("info"):
                        # 점수 및 메이트 정보 파싱
                        if 'score cp' in line:
                            try:
                                parts = line.split()
                                cp_idx = parts.index('cp')
                                score_info = f"점수: {int(parts[cp_idx + 1]) / 100:.2f}"
                            except: pass
                        elif 'score mate' in line:
                            try:
                                parts = line.split()
                                mate_idx = parts.index('mate')
                                score_info = f"메이트: {parts[mate_idx + 1]}수"
                            except: pass
                    
                    if line.startswith("bestmove"):
                        parts = line.split()
                        if len(parts) > 1:
                            best_move = parts[1]
                        break
                
                if best_move:
                    return {'bestmove': best_move, 'score': score_info}
                else:
                    return {'error': 'Could not determine best move'}
            except Exception as e:
                app.logger.error(f"Engine error (get_move): {e}")
                return {'error': str(e)}

    def get_status(self, fen):
        """현재 게임 상태(장군, 외통 등)를 확인합니다."""
        with self.lock:
            try:
                self._start()
                if not self.process:
                    return {'error': 'Engine not running'}

                self._send(f"position fen {fen}")
                self._send("go depth 1")
                
                best_move = ""
                has_mate = False
                output_lines = []
                
                while True:
                    line = self.process.stdout.readline().strip()
                    if not line: break
                    output_lines.append(line)
                    if "info" in line and "mate" in line:
                        has_mate = True
                    if line.startswith("bestmove"):
                        parts = line.split()
                        if len(parts) > 1:
                            best_move = parts[1]
                        break
                
                status = 'ongoing'
                winner = None

                if best_move == '(none)':
                    if has_mate:
                        status = 'checkmate'
                        turn = fen.split(' ')[1]
                        winner = 'cho' if turn == 'w' else 'han'
                    else:
                        status = 'stalemate'
                elif has_mate and 'score mate -' in " ".join(output_lines):
                    status = 'check'
                
                return {'status': status, 'winner': winner}
            except Exception as e:
                app.logger.error(f"Engine error (get_status): {e}")
                return {'error': str(e)}

    def quit(self):
        """엔진을 정상 종료합니다."""
        if self.process:
            try:
                self._send("quit")
                self.process.wait(timeout=1)
            except:
                if self.process:
                    self.process.terminate()

engine = JanggiEngine()

@atexit.register
def cleanup_engine():
    engine.quit()

@app.route('/')
def index():
    """메인 장기 게임 페이지를 렌더링합니다."""
    return render_template('index.html')

@app.route('/docs')
def docs():
    """프로젝트 설명서 페이지를 렌더링합니다."""
    return render_template('documentation.html')

@app.route('/get_ai_move', methods=['POST'])
def get_ai_move():
    """AI의 다음 수를 반환합니다."""
    data = request.json
    fen = data.get('fen')
    ai_mode = data.get('ai_mode', 'depth')
    ai_value = data.get('ai_value', 10)
    
    if not fen:
        return jsonify({'error': 'FEN is missing'}), 400
    
    result = engine.get_move(fen, ai_mode, ai_value)
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

@app.route('/api/play_move', methods=['POST'])
def api_play_move():
    """외부 API 호출용 엔드포인트입니다."""
    data = request.get_json()
    fen = data.get('fen')
    ai_mode = data.get('ai_mode', 'depth')
    ai_value = data.get('ai_value', 10)
    
    if not fen:
        return jsonify({'error': 'FEN is missing'}), 400
    
    result = engine.get_move(fen, ai_mode, ai_value)
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

@app.route('/get_game_status', methods=['POST'])
def get_game_status():
    """게임 종료 및 장군 상태를 확인합니다."""
    fen = request.json.get('fen')
    if not fen:
        return jsonify({'error': 'FEN is missing'}), 400
    
    result = engine.get_status(fen)
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')
