'use client';

import { Toaster as Sonner, ToasterProps } from 'sonner';

type ToasterTheme = Exclude<ToasterProps['theme'], undefined>;

const SonnerToaster = ({
  theme = 'dark',
  position = 'top-center',
  ...props
}: Omit<ToasterProps, 'theme'> & { theme?: ToasterTheme } & { position?: ToasterProps['position'] }) => {
  return (
    <Sonner
      theme={theme}
      position={position}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: 'group toast group-[.toaster]:bg-gray-900 group-[.toaster]:text-gray-50 group-[.toaster]:border-gray-700 group-[.toaster]:shadow-lg max-w-xs',
          title: 'truncate',
          description: 'group-[.toast]:text-gray-300 text-sm truncate',
          actionButton: 'group-[.toast]:bg-gray-700 group-[.toaster]:text-gray-50',
          cancelButton: 'group-[.toast]:bg-gray-800 group-[.toaster]:text-gray-300',
        },
      }}
      {...props}
    />
  );
};

export { SonnerToaster as Toaster };