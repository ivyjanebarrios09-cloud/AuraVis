
"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { Button, buttonVariants } from "./ui/button";
import { Download, MapPin, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface HistoryEntry {
  id: string;
  imageUrl: string;
  description: string;
  timestamp: string;
  location?: string;
}

interface HistoryPanelProps {
  history: HistoryEntry[];
  onClear: () => void;
}

export function HistoryPanel({ history, onClear }: HistoryPanelProps) {
  return (
    <div className="flex flex-col h-full mt-4">
       <div className="flex justify-end mb-2">
        <Button variant="outline" size="sm" onClick={onClear} disabled={history.length === 0}>
          <Trash2 className="mr-2 h-4 w-4" />
          Clear History
        </Button>
      </div>
      <ScrollArea className="flex-1 pr-4">
        <div className="space-y-4">
          {history.length > 0 ? (
            history.map((item) => (
              <Card key={item.id} className="overflow-hidden">
                <CardHeader className="p-0 relative">
                  <div className="aspect-video relative">
                     <Image
                        src={item.imageUrl}
                        alt="Scanned scene"
                        width={300}
                        height={169}
                        className="object-cover w-full h-full"
                        data-ai-hint="scanned scene history"
                      />
                     {item.location && (
                       <div className="absolute bottom-2 left-2 right-2 bg-black/50 text-white p-2 rounded-md text-xs backdrop-blur-sm flex items-center gap-1">
                         <MapPin className="h-3 w-3 shrink-0" />
                         <span className="truncate">{item.location}</span>
                       </div>
                     )}
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                    <CardDescription>{item.description}</CardDescription>
                    <div className="flex justify-between items-center mt-2">
                      <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                      </p>
                      <a
                        href={item.imageUrl}
                        download={`AuraVis-scan-${item.id}.jpeg`}
                        className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        <span>Save</span>
                      </a>
                    </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="text-center text-muted-foreground py-16">
              <p>No scans yet.</p>
              <p className="text-sm">Your scan history will appear here.</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

    