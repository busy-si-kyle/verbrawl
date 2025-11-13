# Project Overview

This is a web-based Wordle-inspired game called "Verbrawl". It is built with Next.js, React, and TypeScript. The game has two modes: "Time Limit Mode" and "Race Mode".

- **Time Limit Mode:** A single-player mode where the player has to guess as many words as possible within a 2-minute time limit.
- **Race Mode:** A real-time multiplayer mode where two players race to solve 5 Wordle-like puzzles.

The application uses Redis for real-time communication in the "Race Mode" and Tailwind CSS for styling.

# Building and Running

To build and run the project, use the following commands:

```bash
# Install dependencies
npm install

# Run the development server
npm run dev

# Build the project for production
npm run build

# Start the production server
npm run start
```

# Development Conventions

- The project uses ESLint for linting. Run `npm run lint` to check for linting errors.
- The project uses a conventional commit message format.
- The code is organized into components, pages, and library files.
- The `components` directory contains reusable React components.
- The `app` directory contains the pages for the application.
- The `lib` directory contains utility functions and the Redis client.
