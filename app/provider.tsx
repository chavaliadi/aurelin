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

    const CreateAndGetUser = async () => {
        if (isAuthenticated) {
            const result = await createUser({});
            setUserDetail(result);
        }
    };

    useEffect(() => {
        if (isAuthenticated) {
            CreateAndGetUser();
        }
    }, [isAuthenticated]);

    return (
        <UserDetailContext.Provider value={{ useDetail, setUserDetail }}>
            <div>{children}</div>
        </UserDetailContext.Provider>
    );
}

export default Provider;