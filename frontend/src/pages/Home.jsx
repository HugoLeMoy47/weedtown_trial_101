import React from 'react';
import Navbar from '../components/Navbar';
import Feed from './Feed';

const Home = () => (
  <>
    <Navbar />
    <main>
      <h2>Bienvenido a WeedTown</h2>
      <Feed />
    </main>
  </>
);

export default Home;
