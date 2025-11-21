import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";
import { Mail, Building2 } from "lucide-react";
import { FileUploader } from "@/components/FileUploader";

const onboardingSchema = z.object({
  organizationName: z.string().min(1, "Company name is required"),
  industry: z.string().min(1, "Industry is required"),
  employeeCount: z.string().min(1, "Employee count is required"),
  annualRevenue: z.string().min(1, "Revenue range is required"),
  monthlySpend: z.string().min(1, "Monthly spend range is required"),
  departments: z.array(z.string()).min(1, "Select at least one department"),
  goals: z.array(z.string()).min(1, "Select at least one goal"),
});

type OnboardingForm = z.infer<typeof onboardingSchema>;

const departmentOptions = [
  "Marketing", "Sales", "Engineering", "Operations", "HR", "Finance"
];

const goalOptions = [
  "Reduce costs", "Optimize budgets", "Track subscriptions", "Improve forecasting", "Vendor management"
];

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [bankConnected, setBankConnected] = useState(false);
  const [emailConnected, setEmailConnected] = useState(false);

  const form = useForm<OnboardingForm>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      organizationName: "",
      industry: "",
      employeeCount: "",
      annualRevenue: "",
      monthlySpend: "",
      departments: [],
      goals: [],
    },
  });

  const createOrganizationMutation = useMutation({
    mutationFn: async (data: OnboardingForm) => {
      return await apiRequest("POST", "/api/organizations", {
        name: data.organizationName,
        industry: data.industry,
        employeeCount: data.employeeCount,
        annualRevenue: data.annualRevenue,
        monthlySpend: data.monthlySpend,
        departments: data.departments,
        goals: data.goals,
      });
    },
    onSuccess: () => {
      toast({
        title: "Organization Created!",
        description: "Now let's connect your financial accounts.",
      });
      setStep(2);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: OnboardingForm) => {
    createOrganizationMutation.mutate(data);
  };

  const handleBankConnect = async () => {
    try {
      setBankConnected(true);
      toast({
        title: "Bank Account Connected",
        description: "Your financial data will be securely imported.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to connect bank account",
        variant: "destructive",
      });
    }
  };

  const handleEmailConnect = async () => {
    try {
      setEmailConnected(true);
      toast({
        title: "Email Connected",
        description: "We'll analyze your financial emails for transactions.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to connect email",
        variant: "destructive",
      });
    }
  };

  const handleComplete = () => {
    toast({
      title: "Welcome to BlackTop Systems!",
      description: "Your account is ready. Redirecting to dashboard...",
    });
    setTimeout(() => {
      setLocation("/dashboard");
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex justify-center mb-8">
          <img 
            src="/logo.png" 
            alt="BlackTop Systems" 
            className="h-12 object-contain" 
          />
        </div>

        {step === 1 ? (
          <Card>
            <CardHeader>
              <CardTitle>Welcome to BlackTop Systems</CardTitle>
              <CardDescription>
                Step 1 of 2: Set up your organization profile
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="organizationName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Acme Corp" data-testid="input-organization-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="industry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Industry</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-industry">
                              <SelectValue placeholder="Select industry" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="technology">Technology</SelectItem>
                            <SelectItem value="healthcare">Healthcare</SelectItem>
                            <SelectItem value="finance">Finance</SelectItem>
                            <SelectItem value="retail">Retail</SelectItem>
                            <SelectItem value="manufacturing">Manufacturing</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="employeeCount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company Size</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-employee-count">
                                <SelectValue placeholder="Employees" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="1-10">1-10</SelectItem>
                              <SelectItem value="11-50">11-50</SelectItem>
                              <SelectItem value="51-200">51-200</SelectItem>
                              <SelectItem value="201-500">201-500</SelectItem>
                              <SelectItem value="500+">500+</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="annualRevenue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Annual Revenue</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-annual-revenue">
                                <SelectValue placeholder="Revenue" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="<$500k">&lt;$500k</SelectItem>
                              <SelectItem value="$500k-$1M">$500k-$1M</SelectItem>
                              <SelectItem value="$1M-$5M">$1M-$5M</SelectItem>
                              <SelectItem value="$5M-$10M">$5M-$10M</SelectItem>
                              <SelectItem value="$10M+">$10M+</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="monthlySpend"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Monthly Spend Range</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-monthly-spend">
                              <SelectValue placeholder="Select range" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="<$10k">&lt;$10k</SelectItem>
                            <SelectItem value="$10k-$50k">$10k-$50k</SelectItem>
                            <SelectItem value="$50k-$100k">$50k-$100k</SelectItem>
                            <SelectItem value="$100k-$500k">$100k-$500k</SelectItem>
                            <SelectItem value="$500k+">$500k+</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="departments"
                    render={() => (
                      <FormItem>
                        <FormLabel>Departments (Select all that apply)</FormLabel>
                        <div className="grid grid-cols-2 gap-3 mt-2">
                          {departmentOptions.map((dept) => (
                            <FormField
                              key={dept}
                              control={form.control}
                              name="departments"
                              render={({ field }) => (
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(dept)}
                                      onCheckedChange={(checked) => {
                                        const current = field.value || [];
                                        field.onChange(
                                          checked
                                            ? [...current, dept]
                                            : current.filter((value) => value !== dept)
                                        );
                                      }}
                                      data-testid={`checkbox-department-${dept.toLowerCase()}`}
                                    />
                                  </FormControl>
                                  <FormLabel className="font-normal">{dept}</FormLabel>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="goals"
                    render={() => (
                      <FormItem>
                        <FormLabel>Primary Goals (Select all that apply)</FormLabel>
                        <div className="space-y-3 mt-2">
                          {goalOptions.map((goal) => (
                            <FormField
                              key={goal}
                              control={form.control}
                              name="goals"
                              render={({ field }) => (
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(goal)}
                                      onCheckedChange={(checked) => {
                                        const current = field.value || [];
                                        field.onChange(
                                          checked
                                            ? [...current, goal]
                                            : current.filter((value) => value !== goal)
                                        );
                                      }}
                                      data-testid={`checkbox-goal-${goal.toLowerCase().replace(/ /g, '-')}`}
                                    />
                                  </FormControl>
                                  <FormLabel className="font-normal">{goal}</FormLabel>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={createOrganizationMutation.isPending}
                    data-testid="button-continue-setup"
                  >
                    {createOrganizationMutation.isPending ? "Setting up..." : "Continue"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Connect Your Accounts</CardTitle>
              <CardDescription>
                Step 2 of 2: Link your bank account and email to get started with financial insights
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-6 w-6 text-primary" />
                    <div>
                      <h3 className="font-medium">Bank Account</h3>
                      <p className="text-sm text-muted-foreground">
                        Connect your business bank account to import transactions
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={handleBankConnect}
                    disabled={bankConnected}
                    data-testid="button-connect-bank"
                  >
                    {bankConnected ? "Connected" : "Connect"}
                  </Button>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Mail className="h-6 w-6 text-primary" />
                    <div>
                      <h3 className="font-medium">Email Account</h3>
                      <p className="text-sm text-muted-foreground">
                        Connect your email to analyze invoices and receipts
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={handleEmailConnect}
                    disabled={emailConnected}
                    data-testid="button-connect-email"
                  >
                    {emailConnected ? "Connected" : "Connect"}
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="font-medium mb-1">Upload Financial Documents</h3>
                  <p className="text-sm text-muted-foreground">
                    Drag and drop your bank statements, invoices, receipts, or CSV files for AI analysis
                  </p>
                </div>
                <FileUploader 
                  source="onboarding"
                  onUploadComplete={(files) => {
                    toast({
                      title: "Documents uploaded!",
                      description: `${files.length} file(s) are being processed for insights.`,
                    });
                  }}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={handleComplete}
                  className="flex-1"
                  data-testid="button-skip-connections"
                >
                  Skip for Now
                </Button>
                <Button
                  onClick={handleComplete}
                  className="flex-1"
                  data-testid="button-complete-onboarding"
                >
                  Complete Setup
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
