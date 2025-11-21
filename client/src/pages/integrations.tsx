import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, CreditCard, FileText, Link2 } from "lucide-react";
import { SiStripe, SiQuickbooks } from "react-icons/si";

const integrations = [
  {
    id: "stripe",
    name: "Stripe",
    description: "Sync payment transactions and subscription data",
    icon: SiStripe,
    category: "payments",
    status: "available",
  },
  {
    id: "plaid",
    name: "Plaid",
    description: "Connect bank accounts for automated transaction sync",
    icon: Building2,
    category: "banking",
    status: "available",
  },
  {
    id: "quickbooks",
    name: "QuickBooks",
    description: "Export financial data to QuickBooks",
    icon: SiQuickbooks,
    category: "accounting",
    status: "coming_soon",
  },
];

export default function Integrations() {
  const { data: connections } = useQuery<any>({
    queryKey: ["/api/integrations/connections"],
  });

  const isConnected = (integrationId: string) => {
    return connections?.some((conn: any) => conn.type === integrationId && conn.status === "active");
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Integrations</h1>
        <p className="text-muted-foreground">Connect external services and data sources</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {integrations.map((integration) => (
          <Card key={integration.id} data-testid={`card-integration-${integration.id}`}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-primary/10">
                    <integration.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle>{integration.name}</CardTitle>
                  </div>
                </div>
                {isConnected(integration.id) && (
                  <Badge variant="default" data-testid={`badge-connected-${integration.id}`}>Connected</Badge>
                )}
                {integration.status === "coming_soon" && (
                  <Badge variant="secondary">Coming Soon</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4">{integration.description}</CardDescription>
              <Button
                variant={isConnected(integration.id) ? "outline" : "default"}
                className="w-full"
                disabled={integration.status === "coming_soon"}
                data-testid={`button-connect-${integration.id}`}
              >
                <Link2 className="mr-2 h-4 w-4" />
                {isConnected(integration.id) ? "Manage" : "Connect"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Request an Integration</CardTitle>
          <CardDescription>
            Don't see the integration you need? Let us know and we'll prioritize it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" data-testid="button-request-integration">
            <FileText className="mr-2 h-4 w-4" />
            Request Integration
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
