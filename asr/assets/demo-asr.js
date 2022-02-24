const SILENT_THRESHOLD = 1000;
const SILENT_DURATION = 10;
const API_URL = "wss://dev.interits.com/asr/stream/socket/16k/client/ws/speech"

var result = null; // xâu text đang nhận dạng
var isStop = true; // có đang DỪNG record audio hay không
var ws = null; // đối tượng web socket

var recorder = null; // đối tượng recorder
var buffer = null; // có chuyển về local được không?
var audioContext = null; // đối tượng audio context
var countSilentDuration = 0;

// Token không giới hạn
var token = 'k-P-k03vy7MgQ0iV8ItD5oLrjh7CigLWMR1oCeP5QMGs461nNu07k-VzENKNQW-c';



/**
 * Hiển thị kết quả text.
 */
function displayText(text) {
    // Cập nhật nội dung
    $('#streaming-content-text').html(text);

    // Scroll đến dòng cuối cùng
    $("#plain-text").scrollTop($("#plain-text")[0].scrollHeight);
}

/**
 * Xử lý JSON trả về.
 * @param resp JSON trả về
 */
function processJsonResponse(resp) {
    if (resp.status == 0 && resp.result && resp.result.hypotheses.length > 0) {
        //console.log(resp);
        // Shorthand of conditional operator
        var transcript = resp.result.hypotheses[0].transcript_normed || resp.result.hypotheses[0].transcript;
        var text = transcript; // decodeURI(
        //console.log(text);

        // Không nhận dạng được
        if (text == '<unk>.') {
            return;
        }

        if (text.endsWith('.')) {
            // Xóa ký tự cuối cùng của xâu
            text = text.slice(0, -1); 
        }

        if (resp.result.final) {
            // Đã nhận dạng xong, lưu kết quả
            result += "<span>" + text + ". </span>";
            displayText(result);
        } else {
            // Vẫn đang nhận dạng
            displayText(result + '<span class="temp">' + text + '</span>');
        }
    }
}

/**
 * Reset lại canvas,
 * chỉ có một dòng kẻ ngang.
 */
function clearCanvas() {
    var canvas = document.getElementById("canvas");
    var width = canvas.width;
    var height = canvas.height;
    var context = canvas.getContext('2d');
    context.clearRect (0, 0, width, height);
    context.strokeStyle = "#FFFFFF";
    context.beginPath();
    context.moveTo(0, height / 2);
    context.lineTo(width, height / 2);
    context.stroke();
}

/**
 * Xóa nội dung kết quả.
 */
function clearContent() {
    result = "";
    displayText('');
}

/**
 * Chuyển dữ liệu mảng 32 bit về 16 bit.
 * @param float32ArrayData 
 */
function convertFloat32ToInt16(float32ArrayData) {
    var l = float32ArrayData.length;
    var int16ArrayData = new Int16Array(l);
    while (l--) {
        int16ArrayData[l] = Math.min(1, float32ArrayData[l]) * 0x7FFF;
    }
    return int16ArrayData;
}

/**
 * Vẽ đồ thị sóng âm.
 * @param data Dữ liệu
 */
function drawBuffer(data) {
    var canvas = document.getElementById("canvas");
    var width = canvas.width;
    var height = canvas.height;
    var context = canvas.getContext('2d');
    context.clearRect (0, 0, width, height);
    
    var step = Math.floor(data.length / width);
    var amp = height / 2;
    var x = 0;
    var y = amp;

    context.strokeStyle = "#FFFFFF";
    context.beginPath();
    context.moveTo(x, y);
    for (var i = 0; i < width; i++) {
        x = i;

        // Tính giá trị y
        var min = 1.0;
        var max = -1.0;
        for (var j = 0; j < step; j++) {
            var datum = data[(i * step) + j];
            if (datum < min) {
                min = datum;
            }
            if (datum > max) {
                max = datum;
            }
        }
        y = ((min + max) / 2 + 1) * amp;

        context.lineTo(x, y);
    }
    context.stroke();
}

/**
 * Dừng record audio.
 */
function stop() {
    // Đánh dấu dừng
    isStop = true;

    // Đổi lại nút
    $("#streaming-btn").html('<img src="asr/images/start.png"/>');

    $("#plain-text").scrollTop($("#plain-text")[0].scrollHeight);
    clearCanvas();
}

/**
 * Đóng web socket.
 */
function closeWS() {
    if (ws && ws.readyState == ws.OPEN) {
        ws.send("EOS");
    }
}

/**
 * Thực hiện nhận dạng giọng nói.
 */
function record() {
    // Nếu đang xử lý thì dừng lại
    if (!isStop) {
        closeWS();
        stop();
        return;
    }

    // Khởi tạo audioContext
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state == 'suspended') {
            audioContext.resume();
        }

        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(function(stream) {
                var audioInput = audioContext.createMediaStreamSource(stream);
                var bufferSize = 2048;
                recorder = audioContext.createScriptProcessor(bufferSize, 1, 1);

                // Xử lý dữ liệu audio
                recorder.onaudioprocess = function(e) {
                    if (!isStop && ws && ws.readyState == ws.OPEN) {
                        // Nếu mà không nói lâu quá thì cũng dừng lại
                        //if (countSilentDuration > SILENT_DURATION) {
                        //    closeWS();
                        //    stop();
                        //    countSilentDuration = 0;
                        //    return;
                        //}
                        
                        buffer = e.inputBuffer.getChannelData(0);
                        drawBuffer(buffer);
                        var int16ArrayData = convertFloat32ToInt16(buffer);
                        countSilentDuration += int16ArrayData.length / audioContext.sampleRate;
                        for (var i = 0; i < int16ArrayData.length; i++) {
                            if (Math.abs(int16ArrayData[i]) > SILENT_THRESHOLD) {
                                countSilentDuration = 0;
                                break;
                            }
                        }

                        // Gửi dữ liệu lên server
                        ws.send(int16ArrayData.buffer);
                    }
                };

                audioInput.connect(recorder);
                recorder.connect(audioContext.destination);
            }).catch(function(e) {
                console.log("Error when getUserMedia");
                console.log(e);
            });
    }

    // Đang chạy thì nút là "Dừng"
    $('#streaming-btn').html('<img src="asr/images/stop.png"/>');

    // Đánh dấu đang chạy
    isStop = false;

    // Kết quả hiện tại
    result = $('#streaming-content-text').html();

    // Địa chỉ URI của web socket
    var url = API_URL
            + "?content-type=audio/x-raw"
            + ",+layout=(string)interleaved"
            + ",+rate=(int)" + audioContext.sampleRate
            + ",+format=(string)S16LE"
            + ",+channels=(int)1"

    ws = new WebSocket(url);
    ws.onopen = function() {
        console.log("Opened connection to websocket " + url);
    };
    ws.onclose = function() {
        console.log("Websocket closed");
        stop();
    };

    // Xử lý dữ liệu server trả về
    ws.onmessage = function(e) {
        var resp = JSON.parse(e.data);
        console.log(resp);
        processJsonResponse(resp);
    };
}


// Khởi tạo
function init() {
    $(window).resize(clearCanvas);
    clearCanvas();
    //displayText(`<p>Xin chào</p><p>Một hai ba bốn</p><p>Xin chào</p><p>Một hai ba bốn</p><span class="temp">Một hai</span>`);
}

init();
