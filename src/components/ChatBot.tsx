import { useState, useRef, useEffect } from 'react';
import { X, MessageCircle, Send } from 'lucide-react';
// SỬA: Đổi sang đường dẫn tương đối
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { useAuth } from './AuthContext';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom'; 

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  bookingData?: any; 
}

export function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'initial-1',
      text: "Xin chào! 🍿 Tôi là CGV-Bot. Tôi có thể giúp bạn tra cứu suất chiếu hoặc đặt vé. Bạn muốn xem phim gì hôm nay?",
      sender: 'bot',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { token, isAuthenticated } = useAuth();
  const navigate = useNavigate(); 

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleNavigateToBooking = (bookingData: any) => {
    if (!bookingData || !bookingData.movie_id || !bookingData.showtime_id) {
        console.error("Lỗi: Chatbot bookingData bị thiếu thông tin.", bookingData);
        return;
    }
    
    const navigationState = {
        movie: { 
            movie_id: bookingData.movie_id, 
            title: bookingData.title 
        },
        showtime: {
            showtime_id: bookingData.showtime_id,
            cinema_name: bookingData.cinema_name,
            start_time: bookingData.start_time,
            ticket_price: bookingData.ticket_price,
        },
        format: (bookingData.features && bookingData.features[0]) || '2D'
    };
    
    setIsOpen(false);
    
    navigate(
      `/movie-detail/${bookingData.movie_id}/seat-selection`, 
      { state: navigationState }
    );
  };

const handleSendMessage = async () => {
    if (inputValue.trim() === '' || isTyping) return;

    if (!isAuthenticated) {
        setMessages(prev => [...prev, {
            id: `bot-error-${Date.now()}`,
            text: "Vui lòng đăng nhập để tôi có thể hỗ trợ bạn tốt hơn nhé! 🔒",
            sender: 'bot',
            timestamp: new Date()
        }]);
        return;
    }

    const userInputText = inputValue.trim();
    const userMessage: Message = { id: `user-${Date.now()}`, text: userInputText, sender: 'user', timestamp: new Date() };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages); 
    setInputValue('');
    setIsTyping(true);

    // === SỬA LỖI LOGIC: Khớp với logic check của server.js ===
    const lastBotMessage = messages.slice().reverse().find(m => m.sender === 'bot');
    let isChoosingShowtime = false;
    if (lastBotMessage) {
        const botQuestion = lastBotMessage.text.toLowerCase();
        // SỬA LỖI: Chỉ kích hoạt Giai đoạn 3 nếu câu hỏi LÀ VỀ CHỌN SUẤT
        if (botQuestion.includes("suất nào") || botQuestion.includes("chọn suất này không")) {
            isChoosingShowtime = true;
        }
    }
    // === KẾT THÚC SỬA LỖI LOGIC ===

    try {
        const response = await fetch('http://localhost:5001/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ 
              message: userInputText,
              history: newMessages.slice(-10) 
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            console.error("Lỗi từ backend:", errData);
            throw new Error(errData.message || 'Phản hồi từ server không tốt.');
        }

        const data = await response.json();
        
        let botText = data.reply;
        let bookingData = null;

        // ***** BẮT ĐẦU SỬA LỖI LOGIC JSON MỚI (PHÒNG THỦ) *****
        
        // SỬA ĐỔI: Dùng regex để trích xuất JSON, thay vì parse trực tiếp
        // Regex này tìm chuỗi đầu tiên bắt đầu bằng [ hoặc { và kết thúc bằng ] hoặc }
        // 's' flag (dotAll) cho phép . khớp với cả ký tự xuống dòng \n
        const jsonMatch = data.reply.match(/(\[.*\]|\{.*\})/s);
        let parsedReply = null;
        
        if (jsonMatch && jsonMatch[1]) {
            try {
                // Thử parse phần JSON đã trích xuất (jsonMatch[1])
                parsedReply = JSON.parse(jsonMatch[1]);
                console.log("ChatBot: Đã trích xuất và parse JSON thành công.", parsedReply);
                
                // Nếu trích xuất thành công, kiểm tra xem có văn bản thừa không
                // Nếu botText gốc không chỉ chứa JSON, thì chỉ lấy phần văn bản thừa đó
                const potentialText = data.reply.replace(jsonMatch[1], "").trim();
                if (potentialText && potentialText.length > 0) {
                    // Đây là trường hợp lỗi (ví dụ: [JSON] \n Xin lỗi...)
                    // Chúng ta ưu tiên JSON, nhưng đặt botText là phần văn bản thừa
                    botText = potentialText; 
                }
                
            } catch (e) {
                // Trích xuất được nhưng parse lỗi -> chat bình thường
                console.warn("ChatBot: Trích xuất được text giống JSON nhưng parse lỗi.", e);
                botText = data.reply; // Giữ nguyên tin nhắn gốc
                parsedReply = null; // Đảm bảo parsedReply là null
            }
        } else {
            // Không tìm thấy JSON -> chat bình thường
            botText = data.reply;
        }
        // ***** KẾT THÚC SỬA LỖI LOGIC JSON MỚI *****


        if (parsedReply) {
            // ĐÃ PARSE THÀNH CÔNG (là object hoặc array)
            let selectedShowtime = null;

            if (Array.isArray(parsedReply) && parsedReply.length > 0) {
                // Trường hợp 1: LLM trả về đúng [ { ... } ]
                selectedShowtime = parsedReply[0];
            } else if (typeof parsedReply === 'object' && parsedReply !== null && !Array.isArray(parsedReply)) {
                // Trường hợp 2: LLM trả về sai { ... }
                if (parsedReply.showtime_id) {
                    selectedShowtime = parsedReply;
                } else if (parsedReply.error) {
                    // SỬA: Xử lý JSON lỗi từ fallback của Giai đoạn 3
                    botText = parsedReply.error;
                    selectedShowtime = null;
                } else if (parsedReply.message) {
                    // Đây là một object lỗi từ tool, gán botText là message đó
                    botText = parsedReply.message;
                    selectedShowtime = null; // Đảm bảo không xử lý thêm
                }
            }

            // Nếu chúng ta tìm thấy một suất chiếu (dù là array hay object)
            if (selectedShowtime) {
                bookingData = selectedShowtime; 
                
                if (isChoosingShowtime) {
                    // GIAI ĐOẠN 3: Đã chọn 1 suất
                    const startTime = selectedShowtime.start_time ? new Date(selectedShowtime.start_time) : null;
                    const showtimeString = (startTime && !isNaN(startTime.getTime()))
                        ? startTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                        : "[giờ không xác định]";

                    const title = selectedShowtime.title || "[phim không xác định]";
                    const cinema = selectedShowtime.cinema_name || "[rạp không xác định]";

                    // Bot text được tạo ra ở đây sẽ GHI ĐÈ lên bất kỳ văn bản thừa nào (như "Xin lỗi...")
                    botText = `OK! Đã chọn suất **${title}** lúc **${showtimeString}** tại **${cinema}**. 
                    
Mời bạn nhấn nút bên dưới để tiếp tục chọn ghế.`;
                
                } else {
                    // GIAI ĐOẠN 2: Tra cứu
                    const firstShowtime = selectedShowtime;
                    const startTime = firstShowtime.start_time ? new Date(firstShowtime.start_time) : null;
                    const showtimeString = (startTime && !isNaN(startTime.getTime()))
                        ? startTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                        : "[giờ không xác định]";
                    
                    botText = `Tuyệt vời! Tôi đã tìm thấy suất chiếu **${firstShowtime.title || "phim"}** lúc **${showtimeString}** tại **${firstShowtime.cinema_name || "rạp"}**. 
                    
Bạn có muốn đặt vé cho suất này không?`;
                    
                    bookingData = firstShowtime; 
                }
            } else if (botText === data.reply && parsedReply.message) { 
                // Xử lý trường hợp parsedReply là JSON lỗi từ tool { "message": "..." }
                botText = parsedReply.message;
            }
        
        }

        const botResponse: Message = { 
            id: `bot-${Date.now()}`, 
            text: botText, 
            sender: 'bot', 
            timestamp: new Date(),
            bookingData: bookingData 
        };
        setMessages(prev => [...prev, botResponse]);

    } catch (error) {
        console.error("Lỗi khi gọi API chat:", error);
        const errorResponse: Message = { id: `bot-error-${Date.now()}`, text: "Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại. 🛠️", sender: 'bot', timestamp: new Date() };
        setMessages(prev => [...prev, errorResponse]);
    } finally {
        setIsTyping(false);
        setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage();
  };

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 bg-red-600 hover:bg-red-700 text-white rounded-full p-4 shadow-lg transition-all duration-300 z-50 flex items-center justify-center"
          aria-label="Mở hội thoại"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {isOpen && (
        <div className="fixed bottom-6 right-6 w-[380px] h-[600px] bg-white rounded-lg shadow-2xl flex flex-col overflow-hidden z-50 border border-gray-200">
          <div className="bg-red-600 text-white p-4 rounded-t-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white rounded-full p-2"><MessageCircle className="w-5 h-5 text-red-600" /></div>
              <div><h3 className="font-semibold">Hỗ trợ CGV</h3><p className="text-xs text-red-100">Đang hoạt động</p></div>
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:bg-red-700 rounded-full p-1 transition-colors" aria-label="Đóng hội thoại"><X className="w-5 h-5" /></button>
          </div>

          <ScrollArea className="flex-1 min-h-0 p-4 bg-gray-50">
            <div className="space-y-4">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-lg py-2 px-3 ${ message.sender === 'user' ? 'bg-red-600 text-white' : 'bg-white text-gray-900 border border-gray-200' }`}>
                    {message.sender === 'bot' ? (
                      <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1">
                        <ReactMarkdown>{message.text}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm">{message.text}</p>
                    )}
                    
                    {/* Hiển thị nút "Đến trang chọn ghế" */}
                    {message.sender === 'bot' && message.bookingData && (
                        <Button 
                            onClick={() => handleNavigateToBooking(message.bookingData)}
                            className="mt-3 w-full bg-red-600 hover:bg-red-700 text-white"
                        >
                            Đến trang chọn ghế
                        </Button>
                    )}
                    
                    <p className={`text-xs mt-1 text-right ${ message.sender === 'user' ? 'text-red-100' : 'text-gray-500' }`}>
                      {message.timestamp.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
              {isTyping && ( <div className="flex justify-start"><div className="bg-white text-gray-900 border border-gray-200 rounded-lg p-3"><div className="flex gap-1"><div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div><div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div><div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div></div></div></div> )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          <div className="p-4 bg-white border-t border-gray-200 rounded-b-lg">
            <form onSubmit={handleFormSubmit} className="flex gap-2">
              <input ref={inputRef} type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={handleKeyDown} placeholder="Nhập tin nhắn của bạn..." disabled={isTyping} className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed" />
              <Button type="submit" disabled={isTyping || inputValue.trim() === ''} className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed" size="icon"><Send className="w-4 h-4" /></Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}