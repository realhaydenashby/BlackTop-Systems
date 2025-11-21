import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  status: "uploading" | "processing" | "complete" | "error";
  error?: string;
}

interface FileUploaderProps {
  onUploadComplete?: (files: UploadedFile[]) => void;
  maxFiles?: number;
  acceptedTypes?: string[];
  source?: string;
}

export function FileUploader({
  onUploadComplete,
  maxFiles = 10,
  acceptedTypes = [".pdf", ".csv", ".xlsx", ".xls", ".png", ".jpg", ".jpeg"],
  source = "onboarding",
}: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const { toast } = useToast();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const validateFile = (file: File): boolean => {
    const fileExtension = `.${file.name.split(".").pop()?.toLowerCase()}`;
    if (!acceptedTypes.includes(fileExtension)) {
      toast({
        title: "Invalid file type",
        description: `${file.name} is not a supported file type. Please upload ${acceptedTypes.join(", ")} files.`,
        variant: "destructive",
      });
      return false;
    }

    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: `${file.name} exceeds the 50MB size limit.`,
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const uploadFile = async (file: File): Promise<void> => {
    const fileId = `${Date.now()}-${file.name}`;
    const newFile: UploadedFile = {
      id: fileId,
      name: file.name,
      size: file.size,
      status: "uploading",
    };

    setUploadedFiles((prev) => [...prev, newFile]);

    try {
      // Get signed upload URL
      const urlResponse = await fetch("/api/documents/upload-url", {
        credentials: "include",
      });
      
      if (!urlResponse.ok) {
        throw new Error("Failed to get upload URL");
      }

      const { url } = await urlResponse.json();

      // Upload file to object storage
      const uploadResponse = await fetch(url, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload file");
      }

      // Register document with backend
      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.id === fileId ? { ...f, status: "processing" } : f
        )
      );

      const fileType = file.name.endsWith(".pdf")
        ? "statement"
        : file.name.endsWith(".csv")
        ? "csv"
        : file.name.match(/\.(xlsx?|xls)$/i)
        ? "invoice"
        : "receipt";

      const docResponse = await fetch("/api/documents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          fileUrl: url.split("?")[0], // Remove query params
          type: fileType,
          source,
        }),
      });

      if (!docResponse.ok) {
        throw new Error("Failed to register document");
      }

      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.id === fileId ? { ...f, status: "complete" } : f
        )
      );

      toast({
        title: "Upload successful",
        description: `${file.name} has been uploaded and is being processed.`,
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? { ...f, status: "error", error: error.message }
            : f
        )
      );

      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload file",
        variant: "destructive",
      });
    }
  };

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);

      if (uploadedFiles.length + fileArray.length > maxFiles) {
        toast({
          title: "Too many files",
          description: `You can only upload up to ${maxFiles} files.`,
          variant: "destructive",
        });
        return;
      }

      const validFiles = fileArray.filter(validateFile);

      for (const file of validFiles) {
        await uploadFile(file);
      }

      if (onUploadComplete) {
        onUploadComplete(uploadedFiles);
      }
    },
    [uploadedFiles, maxFiles, onUploadComplete]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      await handleFiles(files);
    },
    [handleFiles]
  );

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        await handleFiles(e.target.files);
      }
    },
    [handleFiles]
  );

  const removeFile = (fileId: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const getStatusIcon = (status: UploadedFile["status"]) => {
    switch (status) {
      case "uploading":
      case "processing":
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case "complete":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const getStatusText = (status: UploadedFile["status"]) => {
    switch (status) {
      case "uploading":
        return "Uploading...";
      case "processing":
        return "Processing...";
      case "complete":
        return "Complete";
      case "error":
        return "Error";
    }
  };

  return (
    <div className="space-y-4">
      <Card
        className={cn(
          "border-2 border-dashed transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover-elevate"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-testid="dropzone-file-upload"
      >
        <CardContent className="flex flex-col items-center justify-center p-8 text-center">
          <div className="rounded-full bg-primary/10 p-4 mb-4">
            <Upload className="h-8 w-8 text-primary" />
          </div>
          <h3 className="font-semibold mb-2">Drop files here to upload</h3>
          <p className="text-sm text-muted-foreground mb-4">
            or click the button below to browse
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            Supported: PDF, CSV, Excel, Images • Max size: 50MB
          </p>
          <input
            type="file"
            id="file-upload"
            className="hidden"
            multiple
            accept={acceptedTypes.join(",")}
            onChange={handleFileInput}
            data-testid="input-file-upload"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => document.getElementById("file-upload")?.click()}
            data-testid="button-browse-files"
          >
            <Upload className="h-4 w-4 mr-2" />
            Browse Files
          </Button>
        </CardContent>
      </Card>

      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Uploaded Files</h4>
          <div className="space-y-2">
            {uploadedFiles.map((file) => (
              <Card key={file.id} className="p-3" data-testid={`file-item-${file.status}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                        <span className="text-xs">•</span>
                        <p className="text-xs text-muted-foreground">
                          {getStatusText(file.status)}
                        </p>
                      </div>
                      {file.error && (
                        <p className="text-xs text-destructive mt-1">{file.error}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(file.status)}
                    {file.status === "complete" || file.status === "error" ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFile(file.id)}
                        data-testid={`button-remove-file-${file.id}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
