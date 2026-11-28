import { createContext, type Dispatch, type SetStateAction } from "react";

export interface UserDetail {
    name: string;
    email: string;
    token: number;
}

export interface UserDetailContextValue {
    useDetail: UserDetail | undefined;
    setUserDetail: Dispatch<SetStateAction<UserDetail | undefined>>;
}

const UserDetailContext = createContext<UserDetailContextValue | null>(null);

export default UserDetailContext;