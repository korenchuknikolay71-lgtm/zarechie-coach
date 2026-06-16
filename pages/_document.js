import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="ru">
      <Head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <meta name="theme-color" content="#0a0e14" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
