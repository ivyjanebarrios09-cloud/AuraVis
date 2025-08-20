
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, CameraOff, ScanLine, Loader2, History, Volume2, LogOut, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { describeScene, textToSpeech } from "@/ai/flows/describe-scene";
import { useToast } from "@/hooks/use-toast";
import { HistoryPanel } from "./history-panel";
import type { HistoryEntry } from "./history-panel";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { getDatabase, ref, onValue, push, set, query, orderByChild, limitToLast } from "firebase/database";
import { app } from "@/lib/firebase";
import { ThemeToggle } from "./theme-toggle";

const MAX_HISTORY_ITEMS = 10;

type LocationState = {
  latitude: number;
  longitude: number;
} | null;

export function AuraVisUI() {
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [audioSrc, setAudioSrc] = useState("");
  const [currentDescription, setCurrentDescription] = useState("Your scene description will appear here. Turn on the camera and scan to begin.");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [location, setLocation] = useState<LocationState>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [voice, setVoice] = useState<"male" | "female">("female");

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const locationWatcherId = useRef<number | null>(null);
  const { toast } = useToast();
  const { user, logout } = useAuth();

  useEffect(() => {
    if (!user) return;

    const db = getDatabase(app);
    const historyRef = ref(db, `history/${user.uid}`);
    const historyQuery = query(historyRef, orderByChild('timestamp'), limitToLast(MAX_HISTORY_ITEMS));

    const unsubscribe = onValue(historyQuery, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const parsedHistory: HistoryEntry[] = Object.entries(data).map(([id, entry]: [string, any]) => ({
          id,
          ...entry,
        })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setHistory(parsedHistory);
        if (parsedHistory.length > 0 && currentDescription === "Your scene description will appear here. Turn on the camera and scan to begin.") {
          setCurrentDescription(parsedHistory[0].description);
        }
      } else {
        setHistory([]);
      }
    });

    return () => unsubscribe();
  }, [user, currentDescription]);


  const stopLocationWatcher = useCallback(() => {
    if (locationWatcherId.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(locationWatcherId.current);
      locationWatcherId.current = null;
    }
  }, []);

  const startLocationWatcher = useCallback(() => {
    if (navigator.geolocation) {
      // Clear any existing watcher
      stopLocationWatcher();
      
      locationWatcherId.current = navigator.geolocation.watchPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          setLocationError(null);
        },
        (error) => {
          console.error("Geolocation error:", error);
          setLocationError(`Error: ${error.message}`);
          toast({
            variant: "destructive",
            title: "Location Error",
            description: "Could not get your location. Please ensure location services are enabled.",
          });
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        }
      );
    } else {
      setLocationError("Geolocation is not supported by this browser.");
      toast({
        variant: "destructive",
        title: "Location Error",
        description: "Geolocation is not supported by this browser.",
      });
    }
  }, [toast, stopLocationWatcher]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraOn(false);
    stopLocationWatcher();
  }, [stopLocationWatcher]);

  const startCamera = useCallback(async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setIsCameraOn(true);
        startLocationWatcher();
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Camera not supported by this browser.",
        });
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      toast({
        variant: "destructive",
        title: "Camera Access Denied",
        description: "Please allow camera access to use this feature.",
      });
    }
  }, [toast, startLocationWatcher]);

  const handleToggleCamera = useCallback(() => {
    if (isCameraOn) {
      stopCamera();
    } else {
      startCamera();
    }
  }, [isCameraOn, startCamera, stopCamera]);

  const handleRescan = useCallback(async () => {
    if (!isCameraOn || !videoRef.current || videoRef.current.readyState < 2) {
      toast({
        title: "Camera is not ready",
        description:
          "Please turn on the camera and wait for the feed to start.",
      });
      return;
    }
    if (!user) {
      toast({
        variant: 'destructive',
        title: "Not logged in",
        description: "You must be logged in to save scans.",
      });
      return;
    }
    
    setIsLoading(true);
    setCurrentDescription("Analyzing scene...");
    setAudioSrc("");

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const context = canvas.getContext("2d");
    if (context) {
      context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const photoDataUri = canvas.toDataURL("image/jpeg");

      try {
        const result = await describeScene({
          photoDataUri,
          latitude: location?.latitude,
          longitude: location?.longitude,
        });
        
        setCurrentDescription(result.sceneDescription);
        
        const db = getDatabase(app);
        const historyRef = ref(db, `history/${user.uid}`);
        const newHistoryRef = push(historyRef);

        const newEntry: Omit<HistoryEntry, 'id'> = {
          description: result.sceneDescription,
          imageUrl: photoDataUri,
          timestamp: new Date().toISOString(),
        };

        if (result.location) {
          (newEntry as HistoryEntry).location = result.location;
        }

        await set(newHistoryRef, newEntry);
        
        // Now generate audio with the selected voice
        await generateAudio(result.sceneDescription, voice);

      } catch (error) {
        console.error("AI analysis failed:", error);
        setCurrentDescription("Could not get a description for the scene. Please try again.");
        toast({
          variant: "destructive",
          title: "Analysis Failed",
          description: "Could not get a description for the scene.",
        });
      }
    }
    setIsLoading(false);
  }, [isCameraOn, toast, user, location, voice]);

  const generateAudio = useCallback(async (text: string, selectedVoice: "male" | "female") => {
    if (!text || text === "Your scene description will appear here. Turn on the camera and scan to begin." || text === "Analyzing scene...") {
      return;
    }

    setIsGeneratingAudio(true);
    setAudioSrc("");

    try {
      const result = await textToSpeech({
        text,
        voice: selectedVoice,
      });

      if (result.ttsAudioDataUri) {
        setAudioSrc(result.ttsAudioDataUri);
      } else {
          toast({
            variant: "destructive",
            title: "Audio Generation Failed",
            description: "Could not generate audio description.",
          });
      }
    } catch (error) {
      console.error("TTS generation failed:", error);
      toast({
        variant: "destructive",
        title: "Audio Generation Failed",
        description: "An error occurred while generating audio.",
      });
    } finally {
      setIsGeneratingAudio(false);
    }
  }, [toast]);

  const handleVoiceChange = (newVoice: "male" | "female") => {
    setVoice(newVoice);
    generateAudio(currentDescription, newVoice);
  }

  const handleClearHistory = () => {
    if (!user) return;
    const db = getDatabase(app);
    const historyRef = ref(db, `history/${user.uid}`);
    set(historyRef, null);
    setHistory([]);
  };

  const handleRepeatAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch((e) => console.error("Audio playback failed", e));
    }
  }, []);

  useEffect(() => {
    if (audioSrc && audioRef.current) {
      audioRef.current.src = audioSrc;
      audioRef.current.play().catch((e) => console.error("Audio playback failed", e));
    }
  }, [audioSrc]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <main className="w-full max-w-2xl mx-auto">
        <Card className="w-full shadow-2xl rounded-2xl overflow-hidden border-2 border-primary/10 bg-card">
          <CardHeader className="text-center p-6 bg-muted/50 border-b flex flex-row justify-between items-center">
            <div className="flex items-center gap-4">
              <h1 className="text-4xl font-bold text-primary">AuraVis</h1>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Sheet open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon">
                    <History className="h-5 w-5" />
                    <span className="sr-only">View History</span>
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:max-w-md">
                  <SheetHeader>
                    <SheetTitle>Scan History</SheetTitle>
                  </SheetHeader>
                  <HistoryPanel history={history} onClear={handleClearHistory} />
                </SheetContent>
              </Sheet>
              <Button variant="outline" size="icon" onClick={logout}>
                <LogOut className="h-5 w-5" />
                <span className="sr-only">Log out</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="aspect-video bg-muted flex items-center justify-center relative">
              <video
                ref={videoRef}
                className={`w-full h-full object-cover ${
                  isCameraOn ? "block" : "hidden"
                }`}
                playsInline
                muted
                data-ai-hint="camera feed"
              />
              {!isCameraOn && (
                <div className="text-center text-muted-foreground p-8">
                  <Camera size={64} className="mx-auto mb-4" />
                  <p>Camera is off. Press the button to start.</p>
                </div>
              )}
              {isLoading && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white z-10 backdrop-blur-sm">
                  <Loader2 className="animate-spin h-16 w-16 mb-4" />
                  <p className="text-lg font-semibold">Analyzing Scene...</p>
                </div>
              )}
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Button
                  onClick={handleToggleCamera}
                  size="lg"
                  variant="outline"
                  className="py-6 text-lg"
                >
                  {isCameraOn ? (
                    <CameraOff className="mr-2 h-5 w-5" />
                  ) : (
                    <Camera className="mr-2 h-5 w-5" />
                  )}
                  {isCameraOn ? "Turn Off" : "Turn On"}
                </Button>
                <Button
                  onClick={handleRescan}
                  size="lg"
                  disabled={!isCameraOn || isLoading}
                  className="py-6 text-lg"
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <ScanLine className="mr-2 h-5 w-5" />
                  )}
                  Re-scan
                </Button>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-headline font-semibold">
                    Scene Description
                  </h2>
                  <Button
                    onClick={handleRepeatAudio}
                    variant="ghost"
                    size="icon"
                    disabled={!audioSrc || isLoading || isGeneratingAudio}
                    aria-label="Repeat audio description"
                  >
                    <Volume2 className="h-5 w-5" />
                  </Button>
                </div>
                <Card className="bg-muted/50">
                  <CardContent className="p-4">
                    <p className="text-muted-foreground min-h-[4.5rem] flex items-center">
                      {currentDescription}
                    </p>
                  </CardContent>
                </Card>
              </div>
              <div className="space-y-2">
                  <h2 className="text-xl font-headline font-semibold">
                    Voice Options
                  </h2>
                  <div className="flex items-center gap-2">
                    <Mic className="h-5 w-5 text-muted-foreground" />
                    <Select onValueChange={(value: "male" | "female") => handleVoiceChange(value)} defaultValue={voice} disabled={isGeneratingAudio}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Select a voice" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="female">Woman's Voice</SelectItem>
                        <SelectItem value="male">Man's Voice</SelectItem>
                      </SelectContent>
                    </Select>
                     {isGeneratingAudio && <Loader2 className="h-5 w-5 animate-spin" />}
                  </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <audio ref={audioRef} className="hidden" />
      </main>
    </div>
  );
}
