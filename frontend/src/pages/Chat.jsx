import React, { useState, useEffect, useRef } from 'react';
import Navbar from '../components/Navbar';
import api from '../services/api';
import io from 'socket.io-client';

const socket = io('http://localhost:4000');

const Chat = () => {
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    api.get('/chat/contacts')
      .then(res => {
        if (Array.isArray(res.data)) {
          setContacts(res.data);
        } else if (res.data && Array.isArray(res.data.contacts)) {
          setContacts(res.data.contacts);
        } else {
          setContacts([]);
        }
      })
      .catch(() => setError('No se pudo cargar la lista de contactos.'));
  }, []);

  useEffect(() => {
    if(selected) {
      api.get(`/chat/messages/${selected}`)
        .then(res => setMessages(res.data))
        .catch(() => setError('No se pudieron cargar los mensajes.'));
      socket.emit('join', selected);
    }
  }, [selected]);

  useEffect(() => {
    socket.on('message', msg => {
      setMessages(prev => [...prev, msg]);
    });
    return () => socket.off('message');
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    if(input.trim() && selected) {
      socket.emit('message', { to: selected, text: input });
      setMessages(prev => [...prev, { from: 'yo', text: input }]);
      setInput('');
    }
  };

  return (
    <>
      <Navbar />
      <main style={{display:'flex',height:'80vh'}}>
        <aside style={{width:200,background:'#222',padding:12}}>
          <h3>Contactos</h3>
          {contacts.map(c => (
            <div key={c.id} style={{padding:8,background:selected===c.id?'#4caf50':'#333',color:'#fff',borderRadius:4,marginBottom:4,cursor:'pointer'}} onClick={()=>setSelected(c.id)}>
              {c.name}
            </div>
          ))}
        </aside>
        <section style={{flex:1,display:'flex',flexDirection:'column',background:'#181818',padding:12}}>
          <div style={{flex:1,overflowY:'auto'}}>
            {messages.map((msg,i) => (
              <div key={i} style={{textAlign:msg.from==='yo'?'right':'left',margin:'8px 0'}}>
                <span style={{background:msg.from==='yo'?'#4caf50':'#333',color:'#fff',padding:'6px 12px',borderRadius:16,display:'inline-block'}}>{msg.text}</span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div style={{display:'flex',marginTop:8}}>
            <input value={input} onChange={e=>setInput(e.target.value)} style={{flex:1,padding:8}} placeholder="Escribe un mensaje..." />
            <button onClick={sendMessage} style={{marginLeft:8}}>Enviar</button>
          </div>
          {error && <div style={{color:'red'}}>{error}</div>}
        </section>
      </main>
    </>
  );
};

export default Chat;
