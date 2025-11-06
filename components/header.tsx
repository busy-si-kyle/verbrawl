import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Info } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

type HeaderProps = {
  subtitle?: string;
};

export function Header({ subtitle }: HeaderProps) {
  return (
    <header className="border-b bg-background py-3 sm:py-4">
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center">
        <Link href="/" className="flex items-center gap-3 flex-1">
          <div className="flex h-10 w-10 items-center justify-center">
            <Image 
              src="/verbrawl.svg" 
              alt="Verbrawl Logo" 
              width={32}
              height={32}
            />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            <span>Verbrawl</span>
            {subtitle && <span className="ml-2 sm:ml-3 text-muted-foreground text-sm sm:text-base font-normal">| {subtitle}</span>}
          </h1>
        </Link>
        <Dialog>
          <DialogTrigger asChild>
            <Button 
              variant="outline" 
              size="icon" 
              className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg"
              aria-label="About Verbrawl"
            >
              <Info className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>About Verbrawl</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <p>Made by Busy Potato.</p>
              <p>Inspired by Ottomated's <a href="https://squabble.me" className="underline hover:no-underline" target="_blank" rel="noopener noreferrer">Squabble</a>.</p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </header>
  );
}