'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { useRoom } from '@/components/room-provider';
import { toast } from "sonner";

export default function RaceModePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('player-nickname') || '';
    }
    return '';
  });
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const { resetRoom } = useRoom();
  const [playerId] = useState(() => {
    if (typeof window !== 'undefined') {
      let id = localStorage.getItem('player-id');
      if (!id) {
        id = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('player-id', id);
      }
      return id;
    }
    return '';
  });



  const handleCreateRoom = async () => {
    if (!playerId) return;

    setIsCreating(true);

    try {
      const response = await fetch('/api/room', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playerId,
          nickname: nickname
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Redirect to the new room
        router.push(`/race/${data.roomCode}`);
      } else {
        toast.error(data.error || 'Failed to create room. Please try again.');
      }
    } catch (error) {
      console.error('Error creating room:', error);
      toast.error('Failed to create room. Please try again.');
    }

    setIsCreating(false);
  };

  const handleJoinRoom = async () => {
    if (!roomCodeInput.trim() || !playerId) return;

    setIsJoining(true);

    try {
      const response = await fetch('/api/room', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomCode: roomCodeInput.trim(),
          playerId,
          nickname: nickname
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Redirect to the room
        router.push(`/race/${data.roomCode}`);
      } else {
        toast.error(data.error || 'Failed to join room. Please check the room code and try again.');
      }
    } catch (error) {
      console.error('Error joining room:', error);
      toast.error('Failed to join room. Please check the room code and try again.');
    }

    setIsJoining(false);
  };

  const handleJoinRandom = async () => {
    if (!playerId) return;

    setIsJoining(true);

    try {
      const response = await fetch('/api/room', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playerId,
          nickname: nickname,
          joinRandom: true
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Redirect to the room
        router.push(`/race/${data.roomCode}`);
      } else {
        toast.error(data.error || 'Failed to join random room. Please try again.');
      }
    } catch (error) {
      console.error('Error joining random room:', error);
      toast.error('Failed to join random room. Please try again.');
    }

    setIsJoining(false);
  };

  // Save nickname to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && nickname !== undefined) {
      localStorage.setItem('player-nickname', nickname);
    }
  }, [nickname]);

  // Clear any existing room state when component mounts
  useEffect(() => {
    // Reset the room context when this component mounts
    resetRoom();

    return () => {
      // Additional cleanup if needed when leaving this page
    };
  }, [resetRoom]);

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans antialiased">
      <Header subtitle="Race Mode" />
      <main className="flex flex-1 flex-col items-center justify-center p-4 sm:p-4 md:p-4 lg:py-4">
        <div className="w-full max-w-2xl">
          <Card className="border border-gray-700">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl sm:text-3xl">Race Mode</CardTitle>
              <CardDescription>
                Challenge others to complete words faster
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label htmlFor="nickname" className="text-sm font-medium">Nickname</label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      id="nickname"
                      placeholder="Enter nickname (max 10 chars)"
                      className="flex-1"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value.slice(0, 10))}
                      maxLength={10}
                    />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {nickname.length}/10 characters
                  </div>
                </div>
                <div>
                  <label htmlFor="roomCode" className="text-sm font-medium">Room Code</label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      id="roomCode"
                      placeholder="Enter 5-digit room code"
                      className="flex-1"
                      value={roomCodeInput}
                      onChange={(e) => setRoomCodeInput(e.target.value.replace(/\D/g, '').slice(0, 5))}
                      maxLength={5}
                      disabled={isCreating} // Disable input when creating room
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isJoining && !isCreating) {
                          handleJoinRoom();
                        }
                      }}
                    />
                    <Button onClick={handleJoinRoom} disabled={isJoining || isCreating} className="min-w-[100px]">
                      {isJoining ? 'Joining...' : 'Join'}
                    </Button>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={handleCreateRoom}
                    disabled={isCreating || isJoining} // Disable when joining or creating
                  >
                    {isCreating ? 'Creating Room...' : 'Create Room'}
                  </Button>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={handleJoinRandom}
                  disabled={isJoining || isCreating}
                >
                  {isJoining ? 'Finding Opponent...' : 'Join Random'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}