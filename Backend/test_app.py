from flask import Flask, jsonify
import os
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health_check():
    """Simple health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': 'test_app_working',
        'port': os.environ.get('PORT', 'not_set')
    })

@app.route('/', methods=['GET'])
def root():
    """Root endpoint"""
    return jsonify({
        'message': 'Test app is running',
        'port': os.environ.get('PORT', 'not_set'),
        'environment': os.environ.get('FLASK_ENV', 'not_set')
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    logger.info(f"Starting test app on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False) 