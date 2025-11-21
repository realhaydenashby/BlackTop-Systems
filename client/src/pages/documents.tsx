import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, Upload, Loader2, Download, Eye, CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react";
import { ObjectUploader } from "@/components/ObjectUploader";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";

export default function Documents() {
  const [documentType, setDocumentType] = useState("invoice");
  const { toast } = useToast();

  const { data: documents, isLoading } = useQuery<any>({
    queryKey: ["/api/documents"],
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: { fileUrl: string; type: string }) => {
      return await apiRequest("/api/documents", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({
        title: "Document uploaded",
        description: "Processing document and extracting transactions...",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getUploadUrl = async () => {
    const response = await apiRequest("/api/documents/upload-url", {
      method: "GET",
    });
    const { url } = await response.json();
    return { method: "PUT" as const, url };
  };

  const handleUploadComplete = async (result: any) => {
    const uploadedFile = result.successful?.[0];
    if (uploadedFile) {
      const fileUrl = uploadedFile.uploadURL;
      await uploadMutation.mutateAsync({ fileUrl, type: documentType });
    }
  };

  const statusConfig = {
    uploaded: {
      icon: Clock,
      variant: "secondary" as const,
      label: "Uploaded",
    },
    processing: {
      icon: Loader2,
      variant: "default" as const,
      label: "Processing",
    },
    processed: {
      icon: CheckCircle2,
      variant: "outline" as const,
      label: "Processed",
    },
    error: {
      icon: XCircle,
      variant: "destructive" as const,
      label: "Error",
    },
  };

  const documentTypeLabels: Record<string, string> = {
    bank_statement: "Bank Statement",
    invoice: "Invoice",
    receipt: "Receipt",
    payroll: "Payroll",
    subscription_email: "Subscription Email",
    csv_upload: "CSV Upload",
    other: "Other",
  };

  const sortedDocs = (documents || []).sort(
    (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Document Vault</h1>
          <p className="text-muted-foreground">View and manage all your submitted financial documents</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={documentType} onValueChange={setDocumentType}>
            <SelectTrigger className="w-48" data-testid="select-document-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="invoice">Invoice</SelectItem>
              <SelectItem value="receipt">Receipt</SelectItem>
              <SelectItem value="bank_statement">Bank Statement</SelectItem>
              <SelectItem value="payroll">Payroll</SelectItem>
              <SelectItem value="csv_upload">CSV Upload</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <ObjectUploader
            onGetUploadParameters={getUploadUrl}
            onComplete={handleUploadComplete}
            maxNumberOfFiles={5}
            maxFileSize={52428800}
          >
            <Upload className="mr-2 h-4 w-4" />
            Upload Documents
          </ObjectUploader>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card data-testid="card-total-documents">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-documents">
              {documents?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>

        <Card data-testid="card-processed-documents">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium">Processed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-processed-count">
              {documents?.filter((d: any) => d.status === "processed").length || 0}
            </div>
            <p className="text-xs text-muted-foreground">Successfully analyzed</p>
          </CardContent>
        </Card>

        <Card data-testid="card-pending-documents">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pending-count">
              {documents?.filter((d: any) => d.status === "uploaded" || d.status === "processing").length || 0}
            </div>
            <p className="text-xs text-muted-foreground">Awaiting processing</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : sortedDocs.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>All Documents</CardTitle>
            <CardDescription>
              {sortedDocs.length} document{sortedDocs.length !== 1 ? "s" : ""} uploaded
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sortedDocs.map((doc: any) => {
                const config = statusConfig[doc.status as keyof typeof statusConfig] || statusConfig.uploaded;
                const StatusIcon = config.icon;

                return (
                  <Card key={doc.id} data-testid={`document-card-${doc.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="flex-shrink-0 mt-1">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-medium text-foreground" data-testid={`text-doc-type-${doc.id}`}>
                                {documentTypeLabels[doc.type] || doc.type}
                              </h3>
                              <Badge variant={config.variant} data-testid={`badge-status-${doc.id}`}>
                                <StatusIcon className={`h-3 w-3 mr-1 ${doc.status === "processing" ? "animate-spin" : ""}`} />
                                {config.label}
                              </Badge>
                              {doc.extractionConfidence && parseFloat(doc.extractionConfidence) > 0 && (
                                <Badge variant="outline" data-testid={`badge-confidence-${doc.id}`}>
                                  {(parseFloat(doc.extractionConfidence) * 100).toFixed(0)}% confidence
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span data-testid={`text-date-${doc.id}`}>
                                Uploaded {format(new Date(doc.createdAt), "MMM d, yyyy 'at' h:mm a")}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {doc.rawFileUrl && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                data-testid={`button-view-${doc.id}`}
                                onClick={() => window.open(doc.rawFileUrl, "_blank")}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                data-testid={`button-download-${doc.id}`}
                                onClick={() => {
                                  const a = document.createElement("a");
                                  a.href = doc.rawFileUrl;
                                  a.download = `${documentTypeLabels[doc.type]}-${doc.id}.pdf`;
                                  a.click();
                                }}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No documents yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Upload your first financial document to get started
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
