import React from "react";
import DashboardProvider from "./Provider";

function DashboardLayout({ children }: { children: React.ReactNode }) { 
    return(
        <div>
           <DashboardProvider>{children}</DashboardProvider> 
        </div>
    )
}

export default DashboardLayout;