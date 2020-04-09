db.createUser({
    user: 'ltijs',
    pwd: 'ltijs',
    roles: [{
        role: 'readWrite',
        db: 'ltijs'
    }]
});
