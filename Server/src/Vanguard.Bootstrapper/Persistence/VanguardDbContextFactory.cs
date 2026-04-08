using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace Vanguard.Bootstrapper.Persistence;

public sealed class VanguardDbContextFactory : IDesignTimeDbContextFactory<VanguardDbContext>
{
    public VanguardDbContext CreateDbContext(string[] args)
    {
        var basePath = Directory.GetCurrentDirectory();

        var config = new ConfigurationBuilder()
            .SetBasePath(basePath)
            .AddJsonFile("appsettings.json", optional: true)
            .AddJsonFile("appsettings.Development.json", optional: true)
            .AddEnvironmentVariables()
            .Build();

        var cs = config.GetConnectionString("Vanguard") ?? "Data Source=vanguard.db";

        var options = new DbContextOptionsBuilder<VanguardDbContext>()
            .UseSqlite(cs)
            .Options;

        return new VanguardDbContext(options);
    }
}

