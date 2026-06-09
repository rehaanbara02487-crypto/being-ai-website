
from flask import jsonify
import flask
from flask_jwt_extended import JWTManager, jwt_required, create_access_token, decode_token
from datetime import datetime

app = flask.Flask(__name__)
app.config['JWT_SECRET_KEY'] = 'super-secret'  # Change this!
jwt = JWTManager(app)

@app.route('/health')
@jwt_required()
def health_check():
    return {"status": "ok"}

@app.route('/login', methods=['POST'])
def login():
    username = flask.request.json.get('username', None)
    password = flask.request.json.get('password', None)
    if username != 'admin' or password != 'password':
        return {'msg': 'Bad username or password'}, 401

    access_token = create_access_token(identity=username)
    return jsonify(access_token=access_token)

@app.route('/protected')
@jwt_required()
def protected():
    try:
        current_user = decode_token(flask.request.headers.get('Authorization').split()[1])
        return {"user": current_user['identity']}
    except Exception as e:
        return {'msg': 'Invalid token'}, 401

@app.route('/hello', methods=['GET'])
def hello():
    return {'message': 'hello world'}

@app.route('/goodbye', methods=['GET'])
def goodbye():
    return {'message':'goodbye'}

@app.route('/ping', methods=['GET'])
def ping():
    return {'message':'pong'}

@app.route('/status')
def status():
    return {"status":"alive","version":"1.0"}

@app.route('/version')
def version():
    return {'version':'1.0'}

@app.route('/hello-world', methods=['GET'])
def hello_world():
    return {'message': 'Hello, World!'}

@app.route('/test123', methods=['GET'])
def test123():
    return {'ok': True}

@app.route('/status2')
def status2():
    return {'status':'working'}

@app.route('/brotest', methods=['GET'])
def brotest():
    return {'working': True}

@app.route('/time', methods=['GET'])
def get_current_time():
    return {'time': datetime.now().isoformat()}

@app.route('/bro', methods=['GET'])
def bro():
    return {'alive': True}
