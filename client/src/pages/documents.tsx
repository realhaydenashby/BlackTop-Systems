import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, Upload, Loader2 } from "lucide-react";
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

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      uploaded: "secondary",
      processing: "default",
      processed: "default",
      error: "destructive",
    };
    return <Badge variant={variants[status] || "secondary"} data-testid={`badge-status-${status}`}>{status}</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Documents</h1>
          <p className="text-muted-foreground">Upload and manage financial documents</p>
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

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : documents?.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc: any) => (
            <Card key={doc.id} data-testid={`card-document-${doc.id}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <CardTitle className="text-sm font-medium">{doc.type.replace(/_/g, ' ')}</CardTitle>
                </div>
                {getStatusBadge(doc.status)}
              </CardHeader>
              <CardContent>
                <CardDescription className="text-xs mb-2">
                  Uploaded {format(new Date(doc.createdAt), "MMM d, yyyy")}
                </CardDescription>
                {doc.extractionConfidence && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Confidence: </span>
                    <span className="font-medium">{(parseFloat(doc.extractionConfidence) * 100).toFixed(0)}%</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No documents yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Upload your first document to get started</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
