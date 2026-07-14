import React, { useState, useEffect } from 'react';
import {
  Container, Typography, Button, Alert, Stack, Chip, Card, CardContent, Box
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import Navbar from '../components/Navbar';
import api from '../services/api';
import ForumCategoryModal from '../components/ForumCategoryModal';

const Forum = () => {
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState(null);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    api.get('/forum/categories')
      .then(res => {
        if (Array.isArray(res.data)) {
          setCategories(res.data);
        } else if (res.data && Array.isArray(res.data.categories)) {
          setCategories(res.data.categories);
        } else {
          setCategories([]);
        }
      })
      .catch(() => setError('No se pudieron cargar las categorías.'));
  }, []);

  useEffect(() => {
    if (selected) {
      api.get(`/forum?category=${selected}`)
        .then(res => setPosts(Array.isArray(res.data) ? res.data : []))
        .catch(() => setError('No se pudieron cargar los posts del foro.'));
    }
  }, [selected]);

  const handleCreateCategory = (cat) => {
    setCategories(prev => [...prev, cat]);
    setShowModal(false);
    setSuccess('¡Categoría creada exitosamente!');
    setTimeout(() => setSuccess(''), 3000);
  };

  return (
    <>
      <Navbar />
      <Container maxWidth="md" component="main" sx={{ py: 3 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="h5" component="h1">Foros temáticos</Typography>
          <Button startIcon={<AddIcon />} variant="outlined" onClick={() => setShowModal(true)}>
            Nueva categoría
          </Button>
        </Stack>

        <Alert severity="info" sx={{ mb: 2 }}>
          Los foros están en construcción — pronto podrás crear publicaciones por categoría.
        </Alert>
        {error && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" role="status" sx={{ mb: 2 }}>{success}</Alert>}

        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mb: 3 }}>
          {categories.length === 0 ? (
            <Typography color="text.secondary">Aún no hay categorías.</Typography>
          ) : (
            categories.map(cat => (
              <Chip
                key={cat}
                label={cat}
                color={selected === cat ? 'primary' : 'default'}
                onClick={() => setSelected(cat)}
                clickable
              />
            ))
          )}
        </Stack>

        <Stack spacing={2}>
          {selected && posts.length === 0 && (
            <Typography color="text.secondary">No hay publicaciones en esta categoría.</Typography>
          )}
          {posts.map(post => (
            <Card key={post.id} component="article">
              <CardContent>
                <Typography variant="h6" component="h2">{post.title}</Typography>
                <Typography variant="body1" sx={{ my: 1 }}>{post.content}</Typography>
                <Typography variant="caption" color="text.secondary">
                  por {post.author} — {post.createdAt}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Stack>

        <ForumCategoryModal open={showModal} onClose={() => setShowModal(false)} onCreate={handleCreateCategory} />
      </Container>
    </>
  );
};

export default Forum;
