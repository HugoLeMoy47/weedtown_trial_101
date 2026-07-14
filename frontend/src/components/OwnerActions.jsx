import React, { useState } from 'react';
import {
  IconButton, Menu, MenuItem, ListItemIcon, ListItemText,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

// Menú ⋮ para contenido propio: Editar / Eliminar (con confirmación)
const OwnerActions = ({ onEdit, onDelete, deleteLabel = 'esta publicación', size = 'small' }) => {
  const [anchor, setAnchor] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const close = () => setAnchor(null);

  return (
    <>
      <IconButton size={size} onClick={e => setAnchor(e.currentTarget)} aria-label="Opciones de tu contenido" aria-haspopup="menu">
        <MoreVertIcon fontSize={size} />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
        {onEdit && (
          <MenuItem onClick={() => { close(); onEdit(); }}>
            <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Editar</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => { close(); setConfirming(true); }}>
          <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>Eliminar</ListItemText>
        </MenuItem>
      </Menu>
      <Dialog open={confirming} onClose={() => setConfirming(false)} aria-labelledby="confirm-delete-title">
        <DialogTitle id="confirm-delete-title">¿Eliminar?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Vas a eliminar {deleteLabel}. Esta acción no se puede deshacer.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)} color="secondary">Cancelar</Button>
          <Button onClick={() => { setConfirming(false); onDelete(); }} color="error" variant="contained">
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default OwnerActions;
