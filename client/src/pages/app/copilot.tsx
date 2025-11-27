import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  Send, 
  Loader2, 
  Sparkles, 
  User,
  TrendingUp,
  DollarSign,
  Users,
  Calendar,
  RefreshCw,
  MessageSquare
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  actions?: Array<{
    type: string;
    description: string;
    data?: Record<string, unknown>;
  }>;
}

const SUGGESTED_PROMPTS = [
  {
    icon: TrendingUp,
    text: "How's my runway looking?",
    description: "Get current runway analysis",
  },
  {
    icon: DollarSign,
    text: "What are my biggest expenses?",
    description: "Review top spending categories",
  },
  {
    icon: Users,
    text: "Can I afford to hire someone?",
    description: "Hiring impact analysis",
  },
  {
    icon: Calendar,
    text: "What changed this week?",
    description: "Weekly financial summary",
  },
];

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
      data-testid={`message-${message.id}`}
    >
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarFallback className={isUser ? "bg-primary text-primary-foreground" : "bg-muted"}>
          {isUser ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>
      <div className={`flex flex-col gap-1 max-w-[80%] ${isUser ? "items-end" : ""}`}>
        <div
          className={`px-4 py-3 rounded-2xl ${
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-muted rounded-tl-sm"
          }`}
        >
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
        <span className="text-xs text-muted-foreground">
          {format(message.timestamp, "h:mm a")}
        </span>
        {message.actions && message.actions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {message.actions.map((action, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {action.description}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Copilot() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hi! I'm your financial copilot. Ask me anything about your company's finances, runway, spending, or hiring plans. I can analyze your data and help you make better decisions.",
      timestamp: new Date(),
    },
  ]);
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
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
        actions: data.actions,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    },
    onError: (error: Error) => {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `I'm sorry, I encountered an error: ${error.message}. Please try again.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    },
  });

  const handleSend = () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || chatMutation.isPending) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmedInput,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
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

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="p-6 border-b">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold" data-testid="heading-copilot">Financial Copilot</h1>
              <p className="text-sm text-muted-foreground">
                Ask questions about your finances in plain English
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="max-w-4xl mx-auto h-full flex flex-col">
          <ScrollArea className="flex-1 p-6" ref={scrollRef}>
            <div className="space-y-6">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {chatMutation.isPending && (
                <div className="flex gap-3">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarFallback className="bg-muted">
                      <Sparkles className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-muted rounded-tl-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Analyzing your data...</span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {messages.length <= 1 && (
            <div className="px-6 pb-4">
              <p className="text-sm text-muted-foreground mb-3">Try asking:</p>
              <div className="grid grid-cols-2 gap-2">
                {SUGGESTED_PROMPTS.map((prompt, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    className="h-auto py-3 px-4 justify-start text-left hover-elevate"
                    onClick={() => handleSuggestedPrompt(prompt.text)}
                    data-testid={`suggested-prompt-${i}`}
                  >
                    <prompt.icon className="h-4 w-4 mr-3 flex-shrink-0 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{prompt.text}</p>
                      <p className="text-xs text-muted-foreground">{prompt.description}</p>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="p-6 border-t">
            <div className="flex gap-3">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your runway, expenses, hiring plans..."
                className="min-h-[52px] max-h-32 resize-none"
                disabled={chatMutation.isPending}
                data-testid="input-chat-message"
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || chatMutation.isPending}
                size="icon"
                className="h-[52px] w-[52px]"
                data-testid="button-send-message"
              >
                {chatMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Copilot uses your financial data to provide personalized insights
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
