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
const DEBUG = false;

let currentSessionId = null;
let ws = null;

const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const statusDisplay = document.getElementById('status');
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
    }
}

/**
 * Добавляет сообщение в интерфейс чата.
 * 
 * @param {string} text - Текст сообщения
 * @param {boolean} isUser - Флаг сообщения пользователя 
 */
function addMessage(text, isUser) {
    log(`${isUser ? 'Пользователь' : 'Ассистент'}: ${text}`);
    // Здесь можно добавить отображение сообщения в интерфейсе
}

/**
 * Логирует сообщения чата.
 * 
 * @param {string} type - Тип сообщения
 * @param {string} text - Текст сообщения
 */
function logMessage(type, text) {
    log(`Сообщение типа [${type}]: ${text}`);
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

        if (!data || !data.session_id || !data.client_secret || !data.client_secret.value) {
            throw new Error('Неверный формат ответа от сервера: отсутствует токен или ID сессии');
        }

        currentSessionId = data.session_id;
        const token = data.client_secret.value;
        
        // Инициализация WebSocket соединения
        updateStatus('Установка WebSocket соединения...');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        
        // Для WebSocket используем текущий хост без изменений
        // URL для WebSocket - просто заменяем протокол http/https на ws/wss
        const wsUrl = `${protocol}//${window.location.host}/ws/${currentSessionId}`;
        log(`Попытка соединения с WebSocket: ${wsUrl}`);
        
        // Устанавливаем WebSocket соединение с ожиданием
        try {
            ws = await new Promise((resolve, reject) => {
                log('Инициализация WebSocket...');
                const socket = new WebSocket(wsUrl);
                
                // Расширенное логирование для отладки
                for (const state of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) {
                    log(`WebSocket.${state} = ${WebSocket[state]}`);
                }
                
                log(`Начальное состояние WebSocket: ${socket.readyState}`);
                
                // Таймаут для подключения
                const timeoutId = setTimeout(() => {
                    log('Сработал таймаут WebSocket подключения');
                    reject(new Error('Таймаут подключения к WebSocket'));
                }, 5000);
                
                socket.onopen = () => {
                    log(`WebSocket соединение открыто, readyState=${socket.readyState}`);
                    clearTimeout(timeoutId);
                    resolve(socket);
                };
                
                socket.onerror = (error) => {
                    log(`WebSocket ошибка: ${error}`);
                    clearTimeout(timeoutId);
                    reject(new Error('Не удалось установить WebSocket соединение'));
                };
                
                socket.onclose = (event) => {
                    log(`WebSocket соединение закрыто: код=${event.code}, причина="${event.reason}", wasClean=${event.wasClean}`);
                    
                    // Считаем закрытие WebSocket ошибкой только до начала установки WebRTC
                    // После успешного подключения WebRTC мы можем работать даже без WebSocket
                    if (!isConnected && !event.wasClean) {
                        updateStatus('WebSocket соединение разорвано до завершения инициализации', true);
                        stopConnection();
                    } else if (event.wasClean) {
                        log('WebSocket соединение закрыто корректно');
                    } else {
                        // WebSocket закрыт, но соединение WebRTC может продолжать работать
                        log('WebSocket закрыт некорректно, но WebRTC может продолжать работать');
                    }
                    
                    // Пометим WebSocket как закрытый
                    ws = null;
                };
            });
            
            log('WebSocket успешно подключен, настройка обработчиков...');
            
            // Настраиваем обработчики после успешного подключения
            ws.onmessage = (event) => {
                log(`Получено сообщение от WebSocket: ${event.data.substring(0, 100)}`);
                try {
                    const data = JSON.parse(event.data);
                    handleWebSocketMessage(data);
                } catch (error) {
                    log(`Ошибка разбора данных WebSocket: ${error.message}`);
                }
            };
            
            updateStatus('WebSocket соединение установлено');
        } catch (err) {
            log(`Ошибка при установке WebSocket: ${err.message}`);
            throw err;
        }
        
        // Только после успешного установления WebSocket продолжаем с WebRTC
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
            log('Получено сообщение', null);
            if (event.type === 'transcript') {
                addMessage(event.text, true);
                logMessage('transcript', event.text);
                // Отправляем транскрипцию через WebSocket
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'transcript',
                        text: event.text
                    }));
                }
            } else if (event.type === 'response') {
                addMessage(event.text, false);
                logMessage('response', event.text);
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
            throw new Error(`Ошибка установки соединения с OpenAI`);
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

function handleWebSocketMessage(data) {
    log(`Обработка сообщения типа: ${data.type}`);
    
    switch (data.type) {
        case 'status':
            updateStatus(data.message);
            break;
        case 'error':
            updateStatus(data.message, true);
            break;
        case 'session_info':
            log(`Получена информация о сессии: ID=${data.session_id}, активна=${data.is_active}`);
            // Используем эту информацию, чтобы подтвердить активность сессии
            if (!data.is_active) {
                updateStatus('Сессия не активна', true);
                stopConnection();
            }
            break;
        default:
            log(`Ошибка при обработке сообщения: неизвестный тип сообщения`);
    }
}

/**
 * Завершает WebRTC соединение и освобождает ресурсы.
 */
async function stopConnection() {
    // Деактивируем кнопки сразу для предотвращения повторных нажатий
    startButton.disabled = true;
    stopButton.disabled = true;
    updateStatus('Завершение соединения...');
    
    let success = true;
    
    // Закрываем серверную сессию
    if (currentSessionId) {
        try {
            const response = await fetch(`/api/session/${currentSessionId}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                log(`Сессия ${currentSessionId} закрыта на сервере`);
            } else {
                log(`Ошибка при закрытии сессии на сервере: ${response.status}`);
                success = false;
            }
        } catch (error) {
            console.error('Ошибка при закрытии сессии:', error);
            log(`Не удалось отправить запрос на закрытие сессии: ${error.message}`);
            success = false;
        }
    }

    // Закрываем WebSocket
    if (ws) {
        try {
            // Проверяем, что соединение еще открыто
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close(1000, "Нормальное закрытие");
                log('WebSocket соединение закрыто');
            } else {
                log(`WebSocket уже закрыт (состояние: ${ws.readyState})`);
            }
        } catch (e) {
            log(`Ошибка при закрытии WebSocket: ${e.message}`);
            success = false;
        }
        ws = null;
    }

    // Закрываем WebRTC
    if (pc) {
        try {
            pc.close();
            log('WebRTC соединение закрыто');
        } catch (e) {
            log(`Ошибка при закрытии WebRTC: ${e.message}`);
            success = false;
        }
        pc = null;
    }

    // Останавливаем аудио потоки
    if (audioStream) {
        try {
            audioStream.getTracks().forEach(track => {
                track.stop();
                log(`Аудио трек остановлен: ${track.id}`);
            });
        } catch (e) {
            log(`Ошибка при остановке аудио треков: ${e.message}`);
            success = false;
        }
        audioStream = null;
    }
    
    // Сбрасываем состояние
    isConnected = false;
    currentSessionId = null;
    startButton.disabled = false;
    stopButton.disabled = true;
    
    if (success) {
        updateStatus('Разговор успешно завершен');
    } else {
        updateStatus('Разговор завершен с ошибками', true);
    }
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