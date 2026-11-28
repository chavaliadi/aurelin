"use client";

import UserDetailContext from "@/context/UserDetailContext";
import { api } from "@/convex/_generated/api";
import { useConvexAuth, useMutation } from "convex/react";
import React, { useEffect, useState } from "react";

function Provider({ children,
}: Readonly<{
    children: React.ReactNode;
}>
) {
    const { isAuthenticated } = useConvexAuth();
    const createUser = useMutation(api.user.CreateNewUser);
    const [useDetail, setUserDetail] = useState<{ name: string; email: string; token: number } | undefined>();

    useEffect(() => {
        if (!isAuthenticated) return;
        let cancelled = false;
        (async () => {
            const result = await createUser({});
            if (!cancelled) {
                setUserDetail(result);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isAuthenticated, createUser]);

    return (
        <UserDetailContext.Provider value={{ useDetail, setUserDetail }}>
            <div>{children}</div>
        </UserDetailContext.Provider>
    );
}

export default Provider;