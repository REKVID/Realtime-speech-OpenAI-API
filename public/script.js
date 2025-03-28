/**
 * Полифилл для WebRTC API в различных браузерах.
 */
if (!window.RTCPeerConnection) {
    window.RTCPeerConnection = window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
}

if (navigator.mediaDevices === undefined) {
    navigator.mediaDevices = {};
}

if (navigator.mediaDevices.getUserMedia === undefined) {
    navigator.mediaDevices.getUserMedia = function(constraints) {
        const getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

        if (!getUserMedia) {
            return Promise.reject(new Error('getUserMedia is not implemented in this browser'));
        }

        return new Promise(function(resolve, reject) {
            getUserMedia.call(navigator, constraints, resolve, reject);
        });
    }
}

/**
 * Глобальные переменные для управления WebRTC соединением.
 * @type {RTCPeerConnection|null} pc - RTCPeerConnection объект
 * @type {MediaStream|null} audioStream - Поток аудио с микрофона
 * @type {boolean} isConnected - Статус соединения
 * @type {boolean} DEBUG - Флаг режима отладки
 */
let pc = null;
let audioStream = null;
let isConnected = false;
const DEBUG = true;

const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const statusDisplay = document.getElementById('status');
const transcript = document.getElementById('transcript');
const debug = document.getElementById('debug');

if (DEBUG) {
    debug.style.display = 'block';
}

/**
 * Логирует сообщения в консоль и debug-панель.
 * 
 * @param {string} message - Сообщение для логирования
 * @param {Object|null} data - Дополнительные данные для логирования
 */
function log(message, data = null) {
    console.log(message, data);
    if (DEBUG) {
        debug.textContent += `\n${message}`;
        if (data) {
            debug.textContent += `\n${JSON.stringify(data, null, 2)}`;
        }
    }
}

/**
 * Обновляет статус соединения на странице.
 * 
 * @param {string} message - Сообщение статуса
 * @param {boolean} isError - Флаг ошибки
 */
function updateStatus(message, isError = false) {
    statusDisplay.textContent = `Статус: ${message}`;
    statusDisplay.className = isError ? 'error' : '';
    log(message);
}

/**
 * Добавляет сообщение в transcript.
 * 
 * @param {string} text - Текст сообщения
 * @param {boolean} isUser - Флаг, указывающий сообщение пользователя (true) или AI (false)
 */
function addMessage(text, isUser = true) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'ai-message'}`;
    messageDiv.textContent = text;
    transcript.appendChild(messageDiv);
    transcript.scrollTop = transcript.scrollHeight;
}

/**
 * Проверяет поддержку необходимых медиа-возможностей браузера.
 * 
 * @return {Promise<boolean>} Результат проверки
 * @throws {Error} Если браузер не поддерживает необходимые функции
 */
async function checkMediaSupport() {
    try {
        if (!window.RTCPeerConnection) {
            throw new Error('WebRTC не поддерживается в этом браузере');
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('getUserMedia не поддерживается в этом браузере');
        }

        if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
            throw new Error('WebRTC требует HTTPS соединения');
        }

        return true;
    } catch (error) {
        updateStatus(`Ошибка: ${error.message}`, true);
        return false;
    }
}

/**
 * Инициализирует WebRTC соединение с сервером OpenAI.
 * 
 * Процесс включает:
 * 1. Проверку поддержки медиа
 * 2. Получение эфемерного токена
 * 3. Настройку медиапотока
 * 4. Создание и настройку RTCPeerConnection
 * 5. Установку соединения с сервером OpenAI
 * 
 * @throws {Error} При проблемах с установкой соединения
 */
async function initializeConnection() {
    try {
        if (!await checkMediaSupport()) {
            return;
        }

        updateStatus('Получение эфемерного токена...');
        
        const response = await fetch('/api/session');
        const data = await response.json();
        log('Получен ответ от сервера:', data);

        if (!data || !data.client_secret || !data.client_secret.value) {
            throw new Error('Неверный формат ответа от сервера: отсутствует токен');
        }

        const token = data.client_secret.value;
        updateStatus('Настройка WebRTC соединения...');

        try {
            audioStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            updateStatus('Доступ к микрофону получен');
        } catch (error) {
            throw new Error(`Ошибка доступа к микрофону: ${error.message}`);
        }

        pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        });

        audioStream.getTracks().forEach(track => pc.addTrack(track, audioStream));

        const dataChannel = pc.createDataChannel('oai-events');
        dataChannel.onmessage = (e) => {
            const event = JSON.parse(e.data);
            log('Получено сообщение:', event);
            if (event.type === 'transcript') {
                addMessage(event.text, true);
            } else if (event.type === 'response') {
                addMessage(event.text, false);
            }
        };

        pc.ontrack = (event) => {
            const audio = new Audio();
            audio.srcObject = event.streams[0];
            audio.play().catch(error => {
                log('Ошибка воспроизведения аудио:', error);
            });
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        updateStatus('Установка соединения с OpenAI...');
        const sdpResponse = await fetch(`https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/sdp',
                'OpenAI-Beta': 'realtime=v1'
            },
            body: offer.sdp
        });

        if (!sdpResponse.ok) {
            const errorData = await sdpResponse.json();
            throw new Error(`Ошибка установки соединения: ${JSON.stringify(errorData)}`);
        }

        const answer = {
            type: 'answer',
            sdp: await sdpResponse.text()
        };
        await pc.setRemoteDescription(answer);

        isConnected = true;
        startButton.disabled = true;
        stopButton.disabled = false;
        updateStatus('Соединение установлено');
    } catch (error) {
        console.error('Ошибка:', error);
        updateStatus(`Ошибка: ${error.message}`, true);
        stopConnection();
    }
}

/**
 * Завершает WebRTC соединение и освобождает ресурсы.
 * 
 * Выполняет:
 * - Закрытие RTCPeerConnection
 * - Остановку всех медиатреков
 * - Сброс состояния UI
 */
function stopConnection() {
    if (pc) {
        pc.close();
        pc = null;
    }
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }
    isConnected = false;
    startButton.disabled = false;
    stopButton.disabled = true;
    updateStatus('Разговор завершен');
}

startButton.addEventListener('click', initializeConnection);
stopButton.addEventListener('click', stopConnection);

/**
 * Обработчик глобальных ошибок.
 * 
 * @param {string} msg - Сообщение об ошибке
 * @param {string} url - URL, где произошла ошибка
 * @param {number} lineNo - Номер строки
 * @param {number} columnNo - Номер колонки
 * @param {Error} error - Объект ошибки
 * @return {boolean} Всегда возвращает false для продолжения обработки ошибки
 */
window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error('Ошибка:', error);
    updateStatus(`Произошла ошибка: ${msg}`, true);
    return false;
};