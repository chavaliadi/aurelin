'use client';

import { useState } from 'react';
import { PrismaClient } from '@prisma/client'; // Next.js Client Component Anti-pattern

export default function UserList() {
    const [users, setUsers] = useState([]);
    
    // Attempting to query DB directly on the client
    const loadDb = () => {
        const prisma = new PrismaClient();
        console.log(prisma);
    };

    return (
        <div>
            <h2>User List Component</h2>
            <button onClick={loadDb}>Load Users</button>
        </div>
    );
}
