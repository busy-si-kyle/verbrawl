import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Flag } from "lucide-react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans antialiased">
      <Header />
      <main className="flex flex-1 flex-col items-center justify-center p-4 sm:p-4 md:p-4 lg:py-4">
        <div className="w-full max-w-4xl space-y-10 sm:space-y-12">
          <div className="text-center space-y-4">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Choose Your Game Mode
            </h2>
          </div>
          
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Card className="group transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-gray-700">
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-800">
                  <Clock className="h-7 w-7 text-gray-300" />
                </div>
                <CardTitle className="text-xl sm:text-2xl">Time Limit Mode</CardTitle>
                <CardDescription>
                  Solve as many words in 2 minutes!
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-6">
                <Link href="/time-limit">
                  <Button className="w-full">Play Now</Button>
                </Link>
              </CardContent>
            </Card>
            
            <Card className="group transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-gray-700">
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-800">
                  <Flag className="h-7 w-7 text-gray-300" />
                </div>
                <CardTitle className="text-xl sm:text-2xl">Race Mode</CardTitle>
                <CardDescription>
                  Race to solve 5 words first!
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-6">
                <Link href="/race">
                  <Button variant="outline" className="w-full border-gray-600">Play Now</Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}