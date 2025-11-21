import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail, MessageSquare, HelpCircle } from "lucide-react";
import { motion } from "framer-motion";

export default function Contact() {
  return (
    <div className="min-h-screen bg-background">
      <section className="px-6 py-24">
        <div className="max-w-4xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-5xl font-bold mb-6">Get in Touch</h1>
            <p className="text-xl text-muted-foreground">
              Have questions? We'd love to hear from you.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6 mb-16">
            {[
              {
                icon: Mail,
                title: "Email Us",
                description: "hello@blacktop.systems",
                link: "mailto:hello@blacktop.systems"
              },
              {
                icon: MessageSquare,
                title: "Sales Inquiries",
                description: "sales@blacktop.systems",
                link: "mailto:sales@blacktop.systems"
              },
              {
                icon: HelpCircle,
                title: "Support",
                description: "support@blacktop.systems",
                link: "mailto:support@blacktop.systems"
              }
            ].map((contact, index) => (
              <motion.div
                key={contact.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              >
                <Card className="h-full hover-elevate transition-all">
                  <CardContent className="pt-6 text-center">
                    <contact.icon className="w-10 h-10 text-primary mx-auto mb-4" />
                    <h3 className="font-semibold mb-2">{contact.title}</h3>
                    <a 
                      href={contact.link}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      {contact.description}
                    </a>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Send us a message</CardTitle>
                <CardDescription>
                  Fill out the form below and we'll get back to you within 24 hours.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input id="firstName" placeholder="John" data-testid="input-first-name" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input id="lastName" placeholder="Doe" data-testid="input-last-name" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" placeholder="john@example.com" data-testid="input-email" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company">Company</Label>
                    <Input id="company" placeholder="Your Company" data-testid="input-company" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="message">Message</Label>
                    <Textarea 
                      id="message" 
                      placeholder="Tell us how we can help..." 
                      rows={5}
                      data-testid="input-message"
                    />
                  </div>
                  <Button type="submit" className="w-full" data-testid="button-send-message">
                    Send Message
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
