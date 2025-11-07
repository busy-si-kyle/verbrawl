# verbrawl

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Toast Component Implementation

This project uses Sonner for toast notifications:

### Sonner Toast (Current Implementation)
- Located in `components/ui/sonner.tsx`
- Modern toast library with better performance
- Officially recommended by shadcn/ui

#### Usage:
1. The Toaster component is already integrated in your root layout (`app/layout.tsx`):
```tsx
import { Toaster } from "@/components/ui/sonner";

// In your RootLayout component:
<RoomProvider>
  <RealtimePlayerCountProvider>
    <ThemeProvider>
      {children}
      <SessionTracker />
    </ThemeProvider>
  </RealtimePlayerCountProvider>
</RoomProvider>
<Toaster />
```

2. Use in your components:
```tsx
import { toast } from 'sonner';

const MyComponent = () => {
  return (
    <button onClick={() => toast('Event has been created')}>
      Show Toast
    </button>
  );
};
```

#### Advanced Usage:
```tsx
// Success toast
toast.success('Success message', {
  description: 'Operation completed successfully',
});

// Error toast
toast.error('Error message', {
  description: 'Something went wrong',
});

// With action button
toast('Event created', {
  description: 'Your event has been created',
  action: {
    label: 'Undo',
    onClick: () => console.log('Undo'),
  },
});
```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
