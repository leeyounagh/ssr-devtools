type User = { id: number; name: string; email: string };

async function getUser(): Promise<User> {
  const r = await fetch("https://jsonplaceholder.typicode.com/users/1", {
    cache: "no-store",
  });
  return r.json();
}

export default async function Home() {
  const user = await getUser();
  return (
    <main>
      <h1>SSR DevTools demo</h1>
      <p>This page makes one SSR fetch on the server.</p>
      <h2>User #1</h2>
      <ul>
        <li>Name: {user.name}</li>
        <li>Email: {user.email}</li>
      </ul>
      <p>
        Open Chrome DevTools and switch to the <strong>SSR Fetches</strong> panel.
      </p>
    </main>
  );
}
