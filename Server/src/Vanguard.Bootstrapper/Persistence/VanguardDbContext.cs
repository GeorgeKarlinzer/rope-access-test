using Microsoft.EntityFrameworkCore;
using Vanguard.Bootstrapper.Models;

namespace Vanguard.Bootstrapper.Persistence;

public sealed class VanguardDbContext : DbContext
{
    public VanguardDbContext(DbContextOptions<VanguardDbContext> options) : base(options)
    {
    }

    public DbSet<Building> Buildings => Set<Building>();
    public DbSet<Tag> Tags => Set<Tag>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Building>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.Name).IsRequired();
            b.Property(x => x.MainPhotoDataUrl).IsRequired();
            b.HasMany(x => x.Tags)
                .WithOne(x => x.Building!)
                .HasForeignKey(x => x.BuildingId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Tag>(t =>
        {
            t.HasKey(x => x.Id);
            t.Property(x => x.Type).IsRequired();
        });

        modelBuilder.Entity<Tag>().OwnsMany(x => x.Photos, p =>
        {
            p.WithOwner().HasForeignKey("TagId");
            p.HasKey(x => x.Id);
            p.Property(x => x.Id).ValueGeneratedNever();
            p.Property(x => x.FileName).IsRequired();
            p.Property(x => x.ContentType).IsRequired();
            p.Property(x => x.Blob).IsRequired();
        });
        modelBuilder.Entity<Tag>().OwnsMany(x => x.Comments, c =>
        {
            c.WithOwner().HasForeignKey("TagId");
            c.HasKey(x => x.Id);
            c.Property(x => x.Id).ValueGeneratedNever();
            c.Property(x => x.Text).IsRequired();
        });
    }
}

