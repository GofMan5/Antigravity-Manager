import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // For desktop apps, automatic refetch on window focus can be jarring if data changes frequently.
            // Disabling it by default, but keeping it for critical data if needed.
            refetchOnWindowFocus: false,
            retry: 1, // Retry failed queries once
            staleTime: 1000 * 60 * 5, // Data is fresh for 5 minutes by default
        },
    },
});
