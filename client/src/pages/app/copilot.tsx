import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Send, 
  Loader2, 
  Sparkles, 
  TrendingUp,
  DollarSign,
  Users,
  Calendar,
  ArrowUp
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const SUGGESTED_PROMPTS = [
  { icon: TrendingUp, text: "How's my runway?" },
  { icon: DollarSign, text: "Top expenses this month" },
  { icon: Users, text: "Can I afford a new hire?" },
  { icon: Calendar, text: "What changed this week?" },
];

export default function Copilot() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const chatMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      const res = await apiRequest("POST", "/api/live/copilot/chat", {
        message: userMessage,
        conversationHistory: messages.slice(-10).map(m => ({
          role: m.role,
          content: m.content,
        })),
      });
      return res.json();
    },
    onSuccess: (data) => {
      setMessages((prev) => [...prev, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
      }]);
    },
    onError: (error: Error) => {
      setMessages((prev) => [...prev, {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `Something went wrong. Please try again.`,
        timestamp: new Date(),
      }]);
    },
  });

  const handleSend = () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || chatMutation.isPending) return;

    setMessages((prev) => [...prev, {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmedInput,
      timestamp: new Date(),
    }]);
    setInput("");
    chatMutation.mutate(trimmedInput);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestedPrompt = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const showWelcome = messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="max-w-2xl mx-auto px-4 py-8">
          {showWelcome ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-semibold mb-2" data-testid="heading-copilot">
                Financial Copilot
              </h1>
              <p className="text-muted-foreground mb-8 max-w-md">
                Ask questions about your runway, spending, hiring plans, or anything else about your finances.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTED_PROMPTS.map((prompt, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleSuggestedPrompt(prompt.text)}
                    data-testid={`suggested-prompt-${i}`}
                  >
                    <prompt.icon className="h-3.5 w-3.5" />
                    {prompt.text}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  data-testid={`message-${message.id}`}
                >
                  {message.role === "assistant" && (
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mr-3 mt-1 flex-shrink-0">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] px-4 py-2.5 rounded-2xl ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                      {message.content}
                    </p>
                  </div>
                </div>
              ))}
              {chatMutation.isPending && (
                <div className="flex justify-start">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mr-3 mt-1 flex-shrink-0">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="bg-muted px-4 py-2.5 rounded-2xl">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-pulse" />
                      <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-pulse [animation-delay:150ms]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-pulse [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t bg-background">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = '36px';
                  e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
                }}
                onKeyDown={handleKeyDown}
                placeholder="Message"
                rows={1}
                className="w-full resize-none rounded-full border bg-muted/50 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 placeholder:text-muted-foreground"
                disabled={chatMutation.isPending}
                data-testid="input-chat-message"
                style={{ height: '36px', maxHeight: '100px' }}
              />
            </div>
            <Button
              onClick={handleSend}
              disabled={!input.trim() || chatMutation.isPending}
              size="icon"
              className="h-9 w-9 rounded-full bg-primary shrink-0"
              data-testid="button-send-message"
            >
              {chatMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
